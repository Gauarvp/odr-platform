// src/app/api/cases/[id]/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';
import { logCaseEvent } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const roomKey = searchParams.get('room') ?? 'joint';
    const before = searchParams.get('before');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

    const { data: room, error: roomError } = await supabase
      .from('message_rooms')
      .select('*')
      .eq('case_id', id)
      .eq('room_key', roomKey)
      .single();

    if (roomError || !room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    let query = supabase
      .from('messages')
      .select(`*, sender:sender_id(id, full_name, avatar_url, role)`)
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) query = query.lt('created_at', before);

    const { data: messages, error } = await query;
    if (error) throw error;

    const unreadIds = (messages ?? []).filter(m => !m.read_by?.includes(user.id)).map(m => m.id);
    if (unreadIds.length > 0) {
      await supabase.rpc('mark_messages_read', { message_ids: unreadIds, reader_id: user.id });
    }

    return NextResponse.json({ messages: (messages ?? []).reverse(), room, has_more: (messages?.length ?? 0) === limit });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();
    const { content, room_key = 'joint', type = 'party_message', metadata } = body;

    if (!content || content.trim().length === 0) return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    if (content.length > 10000) return NextResponse.json({ error: 'Message too long' }, { status: 400 });

    const { data: room, error: roomError } = await supabase
      .from('message_rooms').select('*').eq('case_id', id).eq('room_key', room_key).single();

    if (roomError || !room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    const { data: message, error } = await supabase
      .from('messages')
      .insert({ room_id: room.id, case_id: id, sender_id: user.id, type, content: content.trim(), metadata: metadata ?? null, is_system: false, read_by: [user.id] })
      .select(`*, sender:sender_id(id, full_name, avatar_url, role)`)
      .single();

    if (error) throw error;

    await logCaseEvent(id, user.id, 'message_sent', { metadata: { room_key, type, message_id: message.id } });
    return NextResponse.json(message, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
