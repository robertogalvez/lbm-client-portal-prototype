import { NextResponse } from 'next/server';

const BASE = 'https://api.clickup.com/api/v2';

function headers() {
  return {
    Authorization: process.env.CLICKUP_API_TOKEN ?? '',
    'Content-Type': 'application/json',
  };
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function GET() {
  const listId   = process.env.CLICKUP_LIST_ID;
  const folderId = process.env.CLICKUP_FOLDER_ID;

  if (!listId && !folderId) {
    return NextResponse.json({ error: 'No CLICKUP_LIST_ID or CLICKUP_FOLDER_ID set' }, { status: 400 });
  }

  try {
    const targetListId = listId ?? null;
    if (!targetListId) {
      return NextResponse.json({ error: 'Set CLICKUP_LIST_ID for debug endpoint' }, { status: 400 });
    }

    const allRaw: Record<string, unknown>[] = [];
    let page = 0;
    while (true) {
      const data = await get(`/list/${targetListId}/task?subtasks=true&include_closed=true&custom_fields=true&page=${page}`);
      const tasks: Record<string, unknown>[] = data.tasks ?? [];
      allRaw.push(...tasks);
      if (tasks.length < 100) break;
      page++;
    }

    // Count by raw status string
    const statusCounts: Record<string, number> = {};
    for (const t of allRaw) {
      const status = (t.status as { status: string })?.status ?? 'UNKNOWN';
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }

    const statusSorted = Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ status, count }));

    // Sample 3 tasks per status
    const samples: Record<string, unknown[]> = {};
    for (const t of allRaw) {
      const status = (t.status as { status: string })?.status ?? 'UNKNOWN';
      if (!samples[status]) samples[status] = [];
      if (samples[status].length < 3) {
        const assignees = (t.assignees as { username: string }[]) ?? [];
        const customFields = (t.custom_fields as { name: string; value: unknown }[]) ?? [];
        const clientField = customFields.find(f => f.name === 'Client Name (AM)');
        samples[status].push({
          id: t.id,
          name: t.name,
          assignees: assignees.map(a => a.username),
          clientFieldValue: clientField?.value ?? null,
          due_date: t.due_date,
          date_updated: t.date_updated,
        });
      }
    }

    // Client name field options
    let clientOptions: unknown[] = [];
    for (const t of allRaw) {
      const cf = (t.custom_fields as { name: string; type_config?: { options?: unknown[] } }[]) ?? [];
      const clientField = cf.find(f => f.name === 'Client Name (AM)');
      if (clientField?.type_config?.options?.length) {
        clientOptions = clientField.type_config.options;
        break;
      }
    }

    // Mirror exactly what the sync does to resolve clientName
    function resolveClientName(t: Record<string, unknown>, opts: { id: string; name: string; orderindex: number }[]): string | null {
      const cf = (t.custom_fields as { name: string; value: unknown; type_config?: { options?: { id: string; name: string; orderindex: number }[] } }[]) ?? [];
      const clientField = cf.find(f => f.name === 'Client Name (AM)');
      if (!clientField) return null;
      const idx = typeof clientField.value === 'number' ? clientField.value : null;
      if (idx === null) return null;
      return clientField.type_config?.options?.[idx]?.name ?? opts[idx]?.name ?? null;
    }

    const clientOptsTyped = (clientOptions as { id: string; name: string; orderindex: number }[]);

    // Tasks that will end up as "Unknown" after sync resolution
    const unknownClientTasks = allRaw
      .filter(t => resolveClientName(t, clientOptsTyped) === null)
      .map(t => {
        const cf = (t.custom_fields as { name: string; value: unknown }[]) ?? [];
        const clientField = cf.find(f => f.name === 'Client Name (AM)');
        return {
          id: t.id,
          name: t.name,
          status: (t.status as { status: string })?.status ?? null,
          assignees: ((t.assignees as { username: string }[]) ?? []).map((a: { username: string }) => a.username),
          clientFieldRawValue: clientField?.value ?? 'FIELD_MISSING',
          clientFieldPresent: !!clientField,
          due_date: t.due_date,
        };
      });

    return NextResponse.json({
      listId: targetListId,
      totalRawTasks: allRaw.length,
      statusBreakdown: statusSorted,
      clientNameOptions: clientOptions,
      samplesPerStatus: samples,
      unknownClientTasks: {
        count: unknownClientTasks.length,
        tasks: unknownClientTasks,
      },
    }, { status: 200 });

  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
