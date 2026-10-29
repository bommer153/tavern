'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, type Service, type ServiceInput } from '@tavern/shared';
import { useState } from 'react';
import { Badge, Button, Check, cn, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import k from '@/styles/layout.module.css';
import s from '../../c/[username]/profile.module.css';

export default function ServicesPage() {
  const q = useQuery({ queryKey: ['my-services'], queryFn: () => api.companion.services() });
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  return (
    <div>
      <PageHeader title="Services" subtitle="What players can book, and for how much." action={<Button onClick={() => setEditing('new')} icon="plus">New service</Button>} />
      <ErrorNote error={q.error ? errorMessage(q.error) : null} onRetry={() => q.refetch()} retrying={q.isFetching} />
      {q.isPending ? (
        <Skeleton style={{ height: 160 }} />
      ) : q.data?.length ? (
        <div className={s.contracts}>
          {q.data.map((svc) => (
            <article key={svc.id} className={cn('tv-plate', s.contract)}>
              <div className={s.contractHead}>
                <div>
                  <p className={s.contractTitle}>{svc.title}</p>
                  <p className="tv-label">{SERVICE_CATEGORY_LABELS[svc.category]} · {svc.unitMinutes} min · up to {svc.maxUnits}×</p>
                </div>
                <Badge tone={svc.active ? 'mint' : 'neutral'}>{svc.active ? 'Active' : 'Paused'}</Badge>
              </div>
              <p className={cn(k.small, k.muted)}>{svc.description}</p>
              <div className={k.between} style={{ marginTop: 'auto' }}>
                <p className={s.cost}>{formatPhp(svc.pricePerUnitCentavos)}</p>
                <Button size="sm" variant="secondary" onClick={() => setEditing(svc)}>Edit</Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !q.error && <Empty icon="gauge" title="No services yet" body="Create a service so players can book you." action={<Button onClick={() => setEditing('new')} icon="plus">Create service</Button>} />
      )}
      {editing && <ServiceForm service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ServiceForm({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const qc = useQueryClient();
  const games = useQuery({ queryKey: ['games'], queryFn: () => api.games.list() });
  const [f, setF] = useState({
    gameId: service?.gameId ?? '',
    category: service?.category ?? 'ranked_duo',
    title: service?.title ?? '',
    description: service?.description ?? '',
    includes: service?.includes.join('\n') ?? '',
    excludes: service?.excludes.join('\n') ?? 'Account sharing or piloting',
    price: service ? String(service.pricePerUnitCentavos / 100) : '150',
    unitMinutes: String(service?.unitMinutes ?? 60),
    maxUnits: String(service?.maxUnits ?? 4),
    cancellationPolicy: service?.cancellationPolicy ?? 'Free cancellation until accepted.',
    active: service?.active ?? true,
  });
  const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);
  const save = useMutation({
    mutationFn: () => {
      const body: ServiceInput = {
        gameId: f.gameId,
        category: f.category,
        title: f.title,
        description: f.description,
        includes: lines(f.includes),
        excludes: lines(f.excludes),
        pricePerUnitCentavos: Math.round(Number(f.price) * 100),
        unitMinutes: Number(f.unitMinutes),
        maxUnits: Number(f.maxUnits),
        cancellationPolicy: f.cancellationPolicy,
        active: f.active,
      };
      return service ? api.companion.updateService(service.id, body) : api.companion.createService(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-services'] });
      qc.invalidateQueries({ queryKey: ['companion-self'] });
      onClose();
    },
  });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value });
  return (
    <Modal open onClose={onClose} title={service ? 'Edit service' : 'New service'} wide>
      <form
        className={k.formGrid}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Game">
          <Select required value={f.gameId} onChange={set('gameId')}>
            <option value="">Choose</option>
            {games.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.category} onChange={set('category')}>{SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{SERVICE_CATEGORY_LABELS[c]}</option>)}</Select>
        </Field>
        <div className={k.full}><Field label="Title"><Input required minLength={3} maxLength={60} value={f.title} onChange={set('title')} /></Field></div>
        <div className={k.full}><Field label="Description"><Textarea maxLength={1000} value={f.description} onChange={set('description')} /></Field></div>
        <Field label="Included (one per line)"><Textarea value={f.includes} onChange={set('includes')} /></Field>
        <Field label="Not included (one per line)"><Textarea value={f.excludes} onChange={set('excludes')} /></Field>
        <Field label="Price per session (₱)"><Input type="number" min={10} max={10000} step="0.01" required value={f.price} onChange={set('price')} /></Field>
        <Field label="Session length">
          <Select value={f.unitMinutes} onChange={set('unitMinutes')}>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}</Select>
        </Field>
        <Field label="Max sessions per order"><Input type="number" min={1} max={12} value={f.maxUnits} onChange={set('maxUnits')} /></Field>
        <div style={{ alignSelf: 'end', minHeight: 44, display: 'flex', alignItems: 'center' }}>
          <Check checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })}>Active (bookable)</Check>
        </div>
        <div className={k.full}><Field label="Cancellation policy"><Textarea maxLength={500} value={f.cancellationPolicy} onChange={set('cancellationPolicy')} /></Field></div>
        <div className={cn(k.full, k.stackSm)}>
          <ErrorNote error={save.error ? errorMessage(save.error) : null} />
          <Button type="submit" className={k.wide} loading={save.isPending}>Save service</Button>
        </div>
      </form>
    </Modal>
  );
}
