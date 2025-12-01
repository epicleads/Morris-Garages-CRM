import { supabaseAdmin } from './config/supabase';

async function repairLead() {
    const leadId = 1413;
    console.log(`Repairing qualification data for lead ${leadId}...`);

    // Check if qualification exists
    const { data: existing, error: checkError } = await supabaseAdmin
        .from('leads_qualification')
        .select('id')
        .eq('lead_id', leadId)
        .maybeSingle();

    if (existing) {
        console.log('Qualification data already exists.');
        return;
    }

    // Fetch lead details to populate some fields if needed
    const { data: lead, error: leadError } = await supabaseAdmin
        .from('leads_master')
        .select('*')
        .eq('id', leadId)
        .single();

    if (!lead) {
        console.error('Lead not found');
        return;
    }

    // Insert default qualification data
    const { data, error } = await supabaseAdmin
        .from('leads_qualification')
        .insert({
            lead_id: leadId,
            qualified_category: 'Hot', // Default
            model_interested: 'Hector', // Default/Placeholder
            lead_category: 'Individual',
            next_followup_at: new Date().toISOString(),
            qualified_by: lead.assigned_to, // Assume assigned user qualified it
            remarks: 'Data repaired by system',
            TEST_DRIVE: false,
            BOOKED: false,
            RETAILED: false
        })
        .select()
        .single();

    if (error) {
        console.error('Error repairing lead:', error);
    } else {
        console.log('Successfully repaired lead qualification:', data);
    }
}

repairLead();
