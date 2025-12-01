/**
 * Script to create a test CRE user
 * 
 * Usage:
 *   npx ts-node Backend/scripts/create-cre-user.ts
 * 
 * Or with custom credentials:
 *   npx ts-node Backend/scripts/create-cre-user.ts --username testcre --password Test123456 --fullName "Test CRE User"
 */

import { createUser } from '../services/user.service';
import { supabaseAdmin } from '../config/supabase';

const DEFAULT_USERNAME = 'testcre';
const DEFAULT_PASSWORD = 'Test123456';
const DEFAULT_FULL_NAME = 'Test CRE User';

async function createCREUser() {
  try {
    // Get arguments from command line
    const args = process.argv.slice(2);
    let username = DEFAULT_USERNAME;
    let password = DEFAULT_PASSWORD;
    let fullName = DEFAULT_FULL_NAME;
    let email: string | null = null;
    let phoneNumber: string | null = null;

    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--username' && args[i + 1]) {
        username = args[i + 1];
        i++;
      } else if (args[i] === '--password' && args[i + 1]) {
        password = args[i + 1];
        i++;
      } else if (args[i] === '--fullName' && args[i + 1]) {
        fullName = args[i + 1];
        i++;
      } else if (args[i] === '--email' && args[i + 1]) {
        email = args[i + 1];
        i++;
      } else if (args[i] === '--phoneNumber' && args[i + 1]) {
        phoneNumber = args[i + 1];
        i++;
      }
    }

    console.log('Creating CRE user...');
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`Full Name: ${fullName}`);

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('user_id, username')
      .eq('username', username)
      .maybeSingle();

    if (existingUser) {
      console.log(`\n⚠️  User with username "${username}" already exists!`);
      console.log('Use different username or delete existing user first.');
      process.exit(1);
    }

    // Create the user
    const user = await createUser({
      username,
      password,
      role: 'CRE',
      fullName,
      email: email || null,
      phoneNumber: phoneNumber || null,
      status: true
    });

    console.log('\n✅ CRE user created successfully!');
    console.log('\n📋 User Details:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Full Name: ${user.fullName || 'N/A'}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Status: ${user.status ? 'Active' : 'Inactive'}`);
    
    console.log('\n🔐 Login Credentials:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    
    console.log('\n💡 You can now login with these credentials at:');
    console.log('   http://localhost:3000/login');
    
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error creating CRE user:');
    console.error(error.message);
    process.exit(1);
  }
}

createCREUser();
