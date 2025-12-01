import { supabaseAdmin } from './config/supabase';

async function debugLead() {
    console.log('Searching for Vikram Reddy...');
    const { data: leads, error } = await supabaseAdmin
        .from('leads_master')
        .select('*')
        .ilike('full_name', '%Vikram Reddy%');

    if (error) {
        console.error('Error fetching lead:', error);
        return;
    }

    console.log('Found leads:', leads);

    if (leads && leads.length > 0) {
        for (const lead of leads) {
            console.log(`Checking qualification for lead ${lead.id}...`);
            const { data: qual, error: qualError } = await supabaseAdmin
                .from('leads_qualification')
                .select('*')
                .eq('lead_id', lead.id);

            if (qualError) {
                console.error('Error fetching qualification:', qualError);
            } else {
                console.log('Qualification data:', qual);
            }
        }
    } else {
        console.log('No leads found with name Vikram Reddy');
    }
}

debugLead();
