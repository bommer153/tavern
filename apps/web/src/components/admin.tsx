'use client';
import type { ReactNode } from 'react';
import k from '@/styles/layout.module.css';
import { Button, Empty, Skeleton } from './ui';

/** Dense data table for admin lists; scrolls horizontally on narrow screens. */
export function Table<T>({ rows, cols, loading, empty = 'Nothing here.' }: { rows?: T[]; cols: [string, (r: T) => ReactNode][]; loading?: boolean; empty?: string }) {
  if (loading) return <Skeleton style={{ height: 192 }} />;
  if (!rows?.length) return <Empty icon="list" title={empty} />;
  return (
    <div className={`tv-cut ${k.tableWrap}`}>
      <table className={k.table}>
        <thead>
          <tr>{cols.map(([h]) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(([h, f]) => <td key={h}>{f(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, hasMore, onPage }: { page: number; hasMore?: boolean; onPage: (p: number) => void }) {
  if (page === 1 && !hasMore) return null;
  return (
    <div className={k.center} style={{ marginTop: 16 }}>
      {page > 1 && <Button variant="secondary" size="sm" onClick={() => onPage(page - 1)}>Previous</Button>}
      {hasMore && <Button variant="secondary" size="sm" onClick={() => onPage(page + 1)}>Next</Button>}
    </div>
  );
}

/** Prompts for a required note before a sensitive admin action. */
export function promptNote(message: string) {
  const note = window.prompt(message);
  return note && note.trim() ? note.trim() : null;
}
