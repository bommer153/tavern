'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pager, promptNote, Table } from '@/components/admin';
import { Avatar, Badge, Button, ErrorNote, PageHeader, SearchField, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import k from '@/styles/layout.module.css';

export default function AdminUsers() {
  const qc = useQueryClient();
  const { has, me } = useSession();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['admin', 'users', search, status, page], queryFn: () => api.admin.users({ q: search || undefined, status: status || undefined, page }) });
  const act = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
  const setStatusFor = (id: string, next: string) => {
    const reason = promptNote(`Reason for setting this account to "${next}" (shown to the user and logged):`);
    if (reason) act.mutate(() => api.admin.setUserStatus(id, next, reason));
  };
  return (
    <div className={k.stackSm}>
      <PageHeader title="Users" />
      <form
        className={k.cluster}
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q);
          setPage(1);
        }}
      >
        <SearchField style={{ maxWidth: 320 }} placeholder="Exact email or username prefix" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        <Select
          style={{ maxWidth: 180 }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </Select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <ErrorNote error={act.error ? errorMessage(act.error) : list.error ? errorMessage(list.error) : null} />
      <Table
        loading={list.isPending}
        rows={list.data?.items}
        cols={[
          ['User', (u) => (
            <div className={k.cluster} style={{ flexWrap: 'nowrap' }}>
              <Avatar name={u.displayName} src={u.avatarUrl} size={28} />
              <div>
                <p className={k.strong}>{u.displayName}</p>
                <p className={k.fine}>@{u.username} · {u.email}</p>
              </div>
            </div>
          )],
          ['Roles', (u) => <div className={k.cluster} style={{ gap: 4 }}>{u.roles.map((r) => <Badge key={r} tone={r === 'admin' ? 'gold' : r === 'companion' ? 'violet' : 'neutral'}>{r}</Badge>)}</div>],
          ['Status', (u) => <Badge tone={u.status === 'active' ? 'mint' : 'red'}>{u.status}</Badge>],
          ['Joined', (u) => new Date(u.createdAt).toLocaleDateString('en-PH')],
          ['', (u) =>
            u.id === me?.id ? null : (
              <div className={k.cluster} style={{ gap: 4 }}>
                {u.status === 'active' ? <Button size="sm" variant="danger" onClick={() => setStatusFor(u.id, 'suspended')}>Suspend</Button> : <Button size="sm" variant="secondary" onClick={() => setStatusFor(u.id, 'active')}>Reinstate</Button>}
                {has('admin') && !u.roles.includes('moderator') && !u.roles.includes('admin') && (
                  <Button size="sm" variant="ghost" onClick={() => act.mutate(() => api.admin.setUserRoles(u.id, [...u.roles, 'moderator']))}>Make moderator</Button>
                )}
                {has('admin') && u.roles.includes('moderator') && (
                  <Button size="sm" variant="ghost" onClick={() => act.mutate(() => api.admin.setUserRoles(u.id, u.roles.filter((r) => r !== 'moderator')))}>Remove moderator</Button>
                )}
              </div>
            )],
        ]}
      />
      <Pager page={page} hasMore={list.data?.hasMore} onPage={setPage} />
    </div>
  );
}
