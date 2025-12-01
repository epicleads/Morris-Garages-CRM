/**
 * Generate bcrypt password hashes for test users
 * 
 * Usage: node scripts/generate_password_hash.js <password>
 * Example: node scripts/generate_password_hash.js cre_tl123
 */

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Usage: node generate_password_hash.js <password>');
  process.exit(1);
}

async function generateHash() {
  try {
    const hash = await bcrypt.hash(password, 10);
    console.log('\n========================================');
    console.log('Password:', password);
    console.log('Hash:', hash);
    console.log('========================================\n');
    
    // Also output SQL format
    console.log('SQL Format:');
    console.log(`'${hash}'`);
    console.log('\n');
  } catch (error) {
    console.error('Error generating hash:', error);
    process.exit(1);
  }
}

generateHash();

