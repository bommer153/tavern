'use client';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import k from '@/styles/layout.module.css';
import { Button, ErrorNote, Field, Modal, Select, Textarea } from './ui';

export function ReportModal({ open, onClose, targetType, targetId }: { open: boolean; onClose: () => void; targetType: string; targetId: string }) {
  const [reason, setReason] = useState('harassment');
  const [details, setDetails] = useState('');
  const m = useMutation({ mutationFn: () => api.reports.create({ targetType, targetId, reason, details: details || undefined }) });
  return (
    <Modal open={open} onClose={onClose} title="Report">
      {m.isSuccess ? (
        <p className={`${k.small} ${k.muted}`}>Thanks — our moderators will review this. You can also block this user.</p>
      ) : (
        <div className={k.form}>
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="harassment">Harassment or hate</option>
              <option value="scam">Scam or off-platform payment</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="underage">Possibly underage</option>
              <option value="spam">Spam</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Details (optional)">
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
          </Field>
          <ErrorNote error={m.error ? errorMessage(m.error) : null} />
          <Button className={k.wide} variant="danger" loading={m.isPending} onClick={() => m.mutate()} icon="flag">
            Submit report
          </Button>
        </div>
      )}
    </Modal>
  );
}
