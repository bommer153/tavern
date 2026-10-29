'use client';
import { gameColors, ICONS } from '@tavern/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ComponentProps, type CSSProperties, forwardRef, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Icon, type IconName } from './icon';
import s from './ui.module.css';

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/* ---------- Buttons ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
type ButtonProps = ComponentProps<'button'> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; href?: string; icon?: IconName };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, href, icon, ...rest },
  ref,
) {
  const cls = cn(s.btn, s[variant], size !== 'md' && s[size], className);
  const glyph = loading ? <Icon name="spinner" size={16} className={s.spin} /> : icon && <Icon name={icon} size={16} />;
  if (href)
    return (
      <Link href={href} className={cls}>
        {glyph}
        {children}
      </Link>
    );
  return (
    <button ref={ref} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {glyph}
      {children}
    </button>
  );
});

/** Square icon-only control with a hexagonal hover well. `label` is required for screen readers. */
export function IconButton({ icon, label, dot, href, className, ...rest }: ComponentProps<'button'> & { icon: IconName; label: string; dot?: boolean; href?: string }) {
  const inner = (
    <>
      <Icon name={icon} size={20} />
      {dot && <span className={s.iconDot} aria-hidden />}
    </>
  );
  if (href)
    return (
      <Link href={href} className={cn(s.iconBtn, className)} aria-label={label}>
        {inner}
      </Link>
    );
  return (
    <button type="button" className={cn(s.iconBtn, className)} aria-label={label} {...rest}>
      {inner}
    </button>
  );
}

/* ---------- Form fields ---------- */

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(s.field, className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(s.field, className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, ComponentProps<'select'>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(s.field, className)} {...p} />;
});

/** Search input with Tavern's lens glyph. */
export const SearchField = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function SearchField({ className, ...p }, ref) {
  return (
    <span className={cn(s.search, className)}>
      <Icon name="search" size={16} />
      <input ref={ref} type="search" className={s.field} {...p} />
    </span>
  );
});

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className={s.fieldWrap}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
      {error ? (
        <span className={s.fieldError} role="alert">{error}</span>
      ) : (
        hint && <span className={s.fieldHint}>{hint}</span>
      )}
    </label>
  );
}

export function Check({ children, ...p }: ComponentProps<'input'> & { children: ReactNode }) {
  return (
    <label className={s.check}>
      <input type="checkbox" {...p} />
      {children}
    </label>
  );
}

/** On/off preference. Native checkbox semantics with role=switch. */
export function Switch({ label, ...p }: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className={s.switchRow}>
      <span>{label}</span>
      <input type="checkbox" role="switch" className={s.switch} {...p} />
    </label>
  );
}

/** Multi-select toggle. Group several inside <Chips>. */
export function Chip({ pressed, children, ...p }: ComponentProps<'button'> & { pressed: boolean }) {
  return (
    <button type="button" aria-pressed={pressed} className={s.chip} {...p}>
      {pressed && <Icon name="check" size={14} />}
      {children}
    </button>
  );
}
export const Chips = ({ children, label }: { children: ReactNode; label?: string }) => (
  <div className={s.chips} role="group" aria-label={label}>
    {children}
  </div>
);

/* ---------- Surfaces ---------- */

/** Chamfered surface for forms, settings and tool sections. Feature UIs use purpose-built layouts instead. */
export function Panel({ title, icon, className, children, ...p }: ComponentProps<'section'> & { title?: string; icon?: IconName }) {
  return (
    <section className={cn('tv-plate', s.panel, className)} {...p}>
      {title && (
        <h2 className={s.panelTitle}>
          {icon && <Icon name={icon} size={18} style={{ color: 'var(--tv-violet-hi)' }} />}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

/* ---------- Status ---------- */

export type Tone = 'neutral' | 'violet' | 'cyan' | 'pink' | 'gold' | 'mint' | 'amber' | 'red';
export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn(s.tag, tone !== 'neutral' && s[`tone-${tone}`], className)}>{children}</span>;
}

/** Only render for rooms/sessions the API reports as live. */
export function LiveBadge({ onArt, className }: { onArt?: boolean; className?: string }) {
  return (
    <span className={cn(s.live, onArt && s.liveOnArt, className)}>
      <span className={s.liveDot} aria-hidden /> LIVE
    </span>
  );
}

const palette = ['#c4b5fd', '#f9a8d4', '#fde68a', '#a7f3d0', '#a5f3fc', '#fdba74'];
const hash = (v: string) => [...v].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
export type Presence = 'online' | 'busy' | 'offline';

/** Illustrated stand-in for people without a photo, stable per name. */
export const placeholderAvatar = (name: string) =>
  `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name)}&backgroundColor=${palette[hash(name) % palette.length].slice(1).toLowerCase()}`;

/** Round identity. `ring` draws a coloured frame (followed / hosting). */
export function Avatar({ name, src, size = 40, status, ring, className }: { name: string; src?: string; size?: number; status?: Presence; ring?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  const face = <img src={src || placeholderAvatar(name)} alt="" loading="lazy" className={s.avatarFace} />;
  const pip = Math.max(12, Math.round(size * 0.3));
  return (
    <span className={cn(s.avatar, className)} style={{ width: size, height: size }}>
      {ring ? (
        <span className={s.avatarRing} style={{ display: 'block', width: '100%', height: '100%', background: ring }}>
          <span style={{ display: 'block', width: '100%', height: '100%', padding: 2, clipPath: 'var(--tv-hex)', background: 'var(--tv-bg)' }}>{face}</span>
        </span>
      ) : (
        face
      )}
      {status && (
        <span className={cn(s.pip, s[`pip-${status}`])} style={{ width: pip, height: pip }} role="img" aria-label={status === 'busy' ? 'In a session' : status}>
          <span />
        </span>
      )}
    </span>
  );
}

export function StatusDot({ status }: { status: Presence }) {
  return (
    <span className={cn(s.pip, s[`pip-${status}`])} style={{ position: 'static', width: 12, height: 12 }} role="img" aria-label={status}>
      <span />
    </span>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn(s.skeleton, className)} style={style} aria-hidden />;
}

/** Honeycomb illustration with the feature's glyph at its centre. */
function EmptyArt({ icon }: { icon: IconName }) {
  return (
    <svg width="96" height="72" viewBox="0 0 96 72" fill="none" className={s.emptyArt} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.5" opacity="0.28">
        <path d="M22 14l14 8v16l-14 8-14-8V22z" />
        <path d="M74 14l14 8v16l-14 8-14-8V22z" />
        <path d="M48 46l10 6v12l-10 6-10-6V52z" />
      </g>
      <path d="M48 6l20 11.5v23L48 52 28 40.5v-23z" fill="rgb(124 77 255 / 0.12)" stroke="currentColor" strokeWidth="1.5" />
      <g transform="translate(36 17)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square">
          <path d={ICONS[icon]} />
        </svg>
      </g>
    </svg>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className={cn('tv-cut', s.empty)}>
      <EmptyArt icon={icon} />
      <p className={s.emptyTitle}>{title}</p>
      {body && <p className={s.emptyBody}>{body}</p>}
      {action && <div className={s.emptyAction}>{action}</div>}
    </div>
  );
}

export function ErrorNote({ error, onRetry, retrying }: { error?: string | null; onRetry?: () => void; retrying?: boolean }) {
  if (!error) return null;
  return (
    <div className={s.error} role="alert">
      <Icon name="alert" size={18} />
      <p>{error}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} disabled={retrying} className={s.errorRetry}>
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}

/* ---------- Overlays ---------- */

/** Native <dialog>: focus trap, Esc and backdrop come from the browser. Becomes a bottom drawer on phones. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} className={cn(s.dialog, wide && s.dialogWide)} aria-label={title}>
      {open && (
        <div className={cn('tv-plate', s.dialogBody)}>
          <span className={s.handle} aria-hidden />
          <div className={s.dialogHead}>
            <h2 className={s.dialogTitle}>{title}</h2>
            <IconButton icon="close" label="Close" onClick={onClose} />
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Dropdown menu: opens below its trigger, closes on Escape, outside click or item click. */
export function Menu({ trigger, label, children }: { trigger: (p: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu'; 'aria-controls': string }) => ReactNode; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={wrap} className={s.menuWrap}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu', 'aria-controls': id })}
      {open && (
        <div id={id} role="menu" aria-label={label} className={cn('tv-plate', s.menu)} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
export function MenuItem({ icon, href, danger, children, ...p }: ComponentProps<'button'> & { icon?: IconName; href?: string; danger?: boolean }) {
  const cls = cn(s.menuItem, danger && s.menuDanger);
  const inner = (
    <>
      {icon && <Icon name={icon} size={17} />}
      {children}
    </>
  );
  return href ? (
    <Link role="menuitem" href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button role="menuitem" type="button" className={cls} {...p}>
      {inner}
    </button>
  );
}
export const MenuSeparator = () => <div className={s.menuSep} role="separator" />;

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className={s.tip}>
      {children}
      <span role="tooltip">{label}</span>
    </span>
  );
}

/* ---------- Navigation within a page ---------- */

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; label?: string }) {
  return (
    <div className={s.tabs} role="tablist" aria-label={label}>
      {items.map((i) => (
        <button key={i.value} type="button" role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)} className={s.tab}>
          {i.label}
          {i.count ? <span className={s.count}>{i.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Section navigation inside an area (companion tools, admin). Active = exact path match, or any sub-path when the item's third flag is set. */
export function NavTabs({ items, label }: { items: readonly (readonly [string, string, boolean?])[]; label: string }) {
  const path = usePathname();
  return (
    <nav className={s.tabs} aria-label={label} style={{ marginBottom: 'var(--tv-s6)' }}>
      {items.map(([href, text, prefix]) => (
        <Link key={href} href={href} className={s.tab} aria-current={path === href || (prefix && path.startsWith(href + '/')) ? 'page' : undefined}>
          {text}
        </Link>
      ))}
    </nav>
  );
}

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className={s.pageHead}>
      <div>
        {eyebrow && <p className="tv-label">{eyebrow}</p>}
        <h1 className={s.pageTitle}>{title}</h1>
        {subtitle && <p className={s.pageSub}>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Section title followed by a hairline rule and an optional "See all". */
export function SectionHeader({ title, href, icon, live }: { title: string; href?: string; icon?: IconName; live?: boolean }) {
  return (
    <div className={s.section}>
      <h2 className={s.sectionTitle}>
        {live && <span className={s.liveDot} aria-hidden />}
        {icon && <Icon name={icon} size={18} style={{ color: 'var(--tv-violet-hi)' }} />}
        {title}
      </h2>
      <span className={s.sectionRule} aria-hidden />
      {href && (
        <Link href={href} className={s.more}>
          View all <Icon name="chevron" size={16} />
        </Link>
      )}
    </div>
  );
}

/** Horizontal swipe row that bleeds to the page gutter. */
export function HScroll({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={cn(s.rail, className)} role={label ? 'group' : undefined} aria-label={label}>
      {children}
    </div>
  );
}

/* ---------- Gaming ---------- */

/** A gift's imageUrl is admin data: an image URL or a single glyph. */
export function GiftGlyph({ image, size = 40 }: { image: string; size?: number }) {
  if (/^(https?:|\/)/.test(image))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" width={size} height={size} loading="lazy" />;
  return (
    <span style={{ fontSize: size * 0.8, lineHeight: 1 }} aria-hidden>
      {image}
    </span>
  );
}

/** CSS background for a game's artwork (shared colours with mobile and the 3D scenes). */
export const gameArt = (slug?: string) => {
  const [a, b] = gameColors(slug);
  return `linear-gradient(140deg, ${a}, ${b})`;
};

/** Official game marks in /public/games, keyed by slug. Games without one fall back to initials. */
const GAME_LOGOS: Record<string, string> = {
  valorant: '/games/valorant.svg',
  mlbb: '/games/mlbb.png',
  dota2: '/games/dota2.svg',
  'wild-rift': '/games/wild-rift.svg',
  pubg: '/games/pubg.svg',
  codm: '/games/codm.svg',
  'free-fire': '/games/free-fire.svg',
  lol: '/games/lol.svg',
};
export const gameLogo = (slug?: string) => (slug ? GAME_LOGOS[slug] : undefined);

export function GameTile({ slug, name, size = 28 }: { slug: string; name: string; size?: number }) {
  const logo = gameLogo(slug);
  const initials = name.split(/[\s:]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  return (
    <span title={name} className={s.gameToken} style={{ width: size, height: size, background: gameArt(slug), fontSize: Math.max(9, size * 0.34) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={logo} alt="" className={s.gameLogo} /> : initials}
    </span>
  );
}

export function Stars({ value, count }: { value: number; count?: number }) {
  return (
    <span className={s.stars}>
      <Icon name="star" size={15} />
      <strong>{value ? value.toFixed(1) : 'New'}</strong>
      {count !== undefined && count > 0 && <span className={s.starsCount}>({count})</span>}
    </span>
  );
}
