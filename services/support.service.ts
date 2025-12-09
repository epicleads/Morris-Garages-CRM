import { supabaseAdmin } from '../config/supabase';

export interface CreateTicketInput {
  created_by: number;
  category: 'bug' | 'feature' | 'question' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  subject: string;
  description: string;
  attachments?: string[]; // Array of image URLs
}

export interface TicketReplyInput {
  ticket_id: number;
  replied_by: number;
  message: string;
  attachments?: string[]; // Array of image URLs
}

export interface UpdateTicketStatusInput {
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assigned_to?: number;
}

export interface SupportTicket {
  id: number;
  created_by: number;
  category: string;
  priority: string;
  subject: string;
  description: string;
  status: string;
  assigned_to: number | null;
  attachments: string[];
  created_at: string;
  updated_at: string;
  creator?: {
    user_id: number;
    full_name: string;
    username: string;
    role: string;
  };
  assignee?: {
    user_id: number;
    full_name: string;
    username: string;
  };
  replies?: TicketReply[];
}

export interface TicketReply {
  id: number;
  ticket_id: number;
  replied_by: number;
  message: string;
  attachments: string[];
  created_at: string;
  replier?: {
    user_id: number;
    full_name: string;
    username: string;
    role: string;
  };
}

/**
 * Create a new support ticket
 */
export async function createTicket(input: CreateTicketInput): Promise<SupportTicket> {
  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      created_by: input.created_by,
      category: input.category,
      priority: input.priority,
      subject: input.subject,
      description: input.description,
      attachments: input.attachments || [],
      status: 'open',
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create ticket: ${error?.message || 'Unknown error'}`);
  }

  return await getTicketById(data.id);
}

/**
 * Get ticket by ID with creator and assignee info
 */
export async function getTicketById(ticketId: number): Promise<SupportTicket> {
  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .select(`
      *,
      creator:users!support_tickets_created_by_fkey(user_id, full_name, username, role),
      assignee:users!support_tickets_assigned_to_fkey(user_id, full_name, username)
    `)
    .eq('id', ticketId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch ticket: ${error?.message || 'Ticket not found'}`);
  }

  // Get replies
  const replies = await getTicketReplies(ticketId);

  return {
    ...data,
    attachments: (data.attachments as string[]) || [],
    replies,
  };
}

/**
 * Get all tickets with filters
 */
export async function getTickets(options: {
  userId?: number; // Filter by creator
  status?: string;
  category?: string;
  priority?: string;
  limit?: number;
  offset?: number;
  assignedTo?: number; // For developers
}): Promise<{ tickets: SupportTicket[]; total: number }> {
  const {
    userId,
    status,
    category,
    priority,
    limit = 50,
    offset = 0,
    assignedTo,
  } = options;

  let query = supabaseAdmin
    .from('support_tickets')
    .select(`
      *,
      creator:users!support_tickets_created_by_fkey(user_id, full_name, username, role),
      assignee:users!support_tickets_assigned_to_fkey(user_id, full_name, username)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) {
    query = query.eq('created_by', userId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (priority) {
    query = query.eq('priority', priority);
  }

  if (assignedTo) {
    query = query.eq('assigned_to', assignedTo);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch tickets: ${error.message}`);
  }

  // Get replies for each ticket
  const ticketsWithReplies = await Promise.all(
    (data || []).map(async (ticket) => {
      const replies = await getTicketReplies(ticket.id);
      return {
        ...ticket,
        attachments: (ticket.attachments as string[]) || [],
        replies,
      };
    })
  );

  return {
    tickets: ticketsWithReplies,
    total: count || 0,
  };
}

/**
 * Get replies for a ticket
 */
export async function getTicketReplies(ticketId: number): Promise<TicketReply[]> {
  const { data, error } = await supabaseAdmin
    .from('support_ticket_replies')
    .select(`
      *,
      replier:users!support_ticket_replies_replied_by_fkey(user_id, full_name, username, role)
    `)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch replies: ${error.message}`);
  }

  return (data || []).map((reply) => ({
    ...reply,
    attachments: (reply.attachments as string[]) || [],
  }));
}

/**
 * Add a reply to a ticket
 */
export async function addTicketReply(input: TicketReplyInput): Promise<TicketReply> {
  // Verify ticket exists
  const ticket = await getTicketById(input.ticket_id);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const { data, error } = await supabaseAdmin
    .from('support_ticket_replies')
    .insert({
      ticket_id: input.ticket_id,
      replied_by: input.replied_by,
      message: input.message,
      attachments: input.attachments || [],
    })
    .select(`
      *,
      replier:users!support_ticket_replies_replied_by_fkey(user_id, full_name, username, role)
    `)
    .single();

  if (error || !data) {
    throw new Error(`Failed to add reply: ${error?.message || 'Unknown error'}`);
  }

  // Update ticket status if developer is replying (mark as in_progress)
  if (data.replier?.role === 'Developer' && ticket.status === 'open') {
    await updateTicketStatus(input.ticket_id, {
      status: 'in_progress',
      assigned_to: input.replied_by,
    });
  }

  return {
    ...data,
    attachments: (data.attachments as string[]) || [],
  };
}

/**
 * Update ticket status
 */
export async function updateTicketStatus(
  ticketId: number,
  input: UpdateTicketStatusInput
): Promise<SupportTicket> {
  const updates: any = {
    status: input.status,
  };

  if (input.assigned_to !== undefined) {
    updates.assigned_to = input.assigned_to;
  }

  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .update(updates)
    .eq('id', ticketId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update ticket: ${error?.message || 'Unknown error'}`);
  }

  return await getTicketById(ticketId);
}

/**
 * Delete tickets older than 90 days (cleanup job)
 */
export async function cleanupOldTickets(): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('cleanup_old_support_tickets');

  if (error) {
    throw new Error(`Failed to cleanup old tickets: ${error.message}`);
  }

  return data || 0;
}

/**
 * Get ticket statistics
 */
export async function getTicketStatistics(): Promise<{
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
}> {
  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .select('status, category, priority');

  if (error) {
    throw new Error(`Failed to fetch statistics: ${error.message}`);
  }

  const stats = {
    total: data?.length || 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
    byCategory: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
  };

  data?.forEach((ticket) => {
    // Count by status
    if (ticket.status === 'open') stats.open++;
    else if (ticket.status === 'in_progress') stats.in_progress++;
    else if (ticket.status === 'resolved') stats.resolved++;
    else if (ticket.status === 'closed') stats.closed++;

    // Count by category
    stats.byCategory[ticket.category] = (stats.byCategory[ticket.category] || 0) + 1;

    // Count by priority
    stats.byPriority[ticket.priority] = (stats.byPriority[ticket.priority] || 0) + 1;
  });

  return stats;
}

