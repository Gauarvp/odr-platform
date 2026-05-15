// src/app/api/cases/[id]/documents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';
import { logCaseEvent } from '@/lib/audit';
import { createHash } from 'crypto';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const supabase = await createClient();

    const { data: documents, error } = await supabase
      .from('documents')
      .select(`*, uploader:uploaded_by(id, full_name, avatar_url)`)
      .eq('case_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ documents });
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

    const { name, type, description, storage_path, mime_type, size_bytes, is_confidential = false, visible_to_roles = ['claimant', 'respondent'] } = body;

    if (!name || !storage_path || !mime_type || !size_bytes) {
      return NextResponse.json({ error: 'Required: name, storage_path, mime_type, size_bytes' }, { status: 400 });
    }

    const checksum = createHash('sha256').update(`${storage_path}:${size_bytes}`).digest('hex');

    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        case_id: id,
        uploaded_by: user.id,
        type: type ?? 'evidence',
        name,
        description: description ?? null,
        storage_path,
        mime_type,
        size_bytes,
        checksum,
        is_confidential,
        visible_to_roles,
        version: 1,
      })
      .select(`*, uploader:uploaded_by(id, full_name, avatar_url)`)
      .single();

    if (error) throw error;

    await logCaseEvent(id, user.id, 'document_uploaded', {
      metadata: { document_id: document.id, name, type },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
