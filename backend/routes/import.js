const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db');

// Configure multer for CSV file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Import from Google Forms CSV
router.post('/google-forms', upload.single('csvfile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded.' });
  }

  try {
    const csvContent = req.file.buffer.toString('utf-8');

    // Parse CSV
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or has no data rows.' });
    }

    // Get column headers for mapping guidance
    const headers = Object.keys(records[0]);

    // Auto-map common Google Forms column patterns
    const columnMap = autoMapColumns(headers);

    let imported = 0;
    let skipped = 0;
    let errors = [];

    // Use transaction
    await db.transaction(async (tx) => {
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        try {
          const parentName = getFieldValue(row, columnMap.parent_name) || 'Unknown';
          const parentEmail = getFieldValue(row, columnMap.parent_email) || '';
          const parentPhone = getFieldValue(row, columnMap.parent_phone) || 'Not provided';
          const childName = getFieldValue(row, columnMap.child_name) || '';
          const childDob = getFieldValue(row, columnMap.child_dob) || '';
          const childGender = getFieldValue(row, columnMap.child_gender) || '';
          const session = mapSession(getFieldValue(row, columnMap.session) || '');
          const medicalInfo = getFieldValue(row, columnMap.medical_info) || '';
          const photoConsent = mapPhotoConsent(getFieldValue(row, columnMap.photo_consent));

          if (!childName) {
            errors.push(`Row ${i + 2}: Missing child name, skipped.`);
            skipped++;
            continue;
          }

          // Check for duplicate
          if (childName && childDob) {
            const existing = await tx.queryOne(
              'SELECT id FROM registrations WHERE child_name = ? AND child_dob = ?',
              [childName, childDob]
            );
            if (existing) {
              skipped++;
              continue;
            }
          }

          await tx.run(
            `INSERT INTO registrations (parent_name, parent_email, parent_phone, child_name, child_dob, child_gender, session, medical_info, photo_consent, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'google_forms')`,
            [
              parentName,
              parentEmail || null,
              parentPhone,
              childName,
              childDob || 'Not provided',
              childGender || null,
              session,
              medicalInfo || null,
              photoConsent
            ]
          );
          imported++;
        } catch (err) {
          errors.push(`Row ${i + 2}: ${err.message}`);
          skipped++;
        }
      }
    });

    res.json({
      message: `Import complete. ${imported} records imported, ${skipped} skipped.`,
      imported,
      skipped,
      errors: errors.slice(0, 10), // Return first 10 errors max
      columnMapping: columnMap,
      detectedHeaders: headers
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to process CSV file: ' + err.message });
  }
});

/**
 * Auto-map Google Forms CSV headers to our schema fields
 */
function autoMapColumns(headers) {
  const map = {
    parent_name: null,
    parent_email: null,
    parent_phone: null,
    child_name: null,
    child_dob: null,
    child_gender: null,
    session: null,
    medical_info: null,
    photo_consent: null
  };

  const lowerHeaders = headers.map(h => h.toLowerCase());

  for (let i = 0; i < headers.length; i++) {
    const h = lowerHeaders[i];

    // Parent name patterns
    if (h.includes('parent') && h.includes('name') || h.includes('guardian') && h.includes('name')) {
      map.parent_name = headers[i];
    }
    // Email
    else if (h.includes('email') || h.includes('e-mail')) {
      map.parent_email = headers[i];
    }
    // Phone
    else if (h.includes('phone') || h.includes('mobile') || h.includes('contact number') || h.includes('telephone')) {
      map.parent_phone = headers[i];
    }
    // Child name
    else if ((h.includes('child') && h.includes('name')) || h.includes("child's name") || h.includes('player name') || h.includes("player's name")) {
      map.child_name = headers[i];
    }
    // DOB
    else if (h.includes('date of birth') || h.includes('dob') || h.includes('d.o.b') || h.includes('birthday')) {
      map.child_dob = headers[i];
    }
    // Gender
    else if (h.includes('gender') || h.includes('sex')) {
      map.child_gender = headers[i];
    }
    // Session
    else if (h.includes('session') || h.includes('time') || h.includes('age group') || h.includes('which session')) {
      map.session = headers[i];
    }
    // Medical
    else if (h.includes('medical') || h.includes('health') || h.includes('condition') || h.includes('allerg') || h.includes('inhaler') || h.includes('medication')) {
      map.medical_info = headers[i];
    }
    // Photo consent
    else if (h.includes('photo') || h.includes('photograph') || h.includes('consent')) {
      map.photo_consent = headers[i];
    }
  }

  // Fallback: if no child_name found, try generic "name" field
  if (!map.child_name) {
    const nameIdx = lowerHeaders.findIndex(h => h === 'name' || h === 'full name');
    if (nameIdx >= 0) map.child_name = headers[nameIdx];
  }

  // Fallback: first "name" column as parent, second as child
  if (!map.parent_name && !map.child_name) {
    const nameColumns = headers.filter(h => h.toLowerCase().includes('name'));
    if (nameColumns.length >= 2) {
      map.parent_name = nameColumns[0];
      map.child_name = nameColumns[1];
    } else if (nameColumns.length === 1) {
      map.child_name = nameColumns[0];
    }
  }

  return map;
}

/**
 * Safely get a field value from a row using a mapped column name
 */
function getFieldValue(row, columnName) {
  if (!columnName) return '';
  return row[columnName] || '';
}

/**
 * Map free-text session descriptions to our session IDs
 */
function mapSession(value) {
  const v = value.toLowerCase();
  if (v.includes('girl') || v.includes('1') && v.includes('2') || v.includes('13:00') || v.includes('1pm')) {
    return '1-2-girls';
  }
  if (v.includes('11') && (v.includes('12') || v.includes('16'))) {
    return '11-12-mixed';
  }
  if (v.includes('10') || v.includes('6') && v.includes('11')) {
    return '10-11-mixed';
  }
  return '10-11-mixed'; // Default
}

/**
 * Map photo consent text to boolean
 */
function mapPhotoConsent(value) {
  if (!value) return 1;
  const v = value.toLowerCase();
  if (v.includes('no') || v.includes('decline') || v.includes('opt out') || v.includes('do not')) {
    return 0;
  }
  return 1;
}

module.exports = router;
