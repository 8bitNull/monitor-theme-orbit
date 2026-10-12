import {useId, useState, type ReactNode} from 'react'

export function Foldout({label, children, className = ""}: {label: string; children: ReactNode; className?: string}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <section className={`surface-card p-3 ${className}`}>
    <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-semibold" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      {label}<i className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'} text-secondary`} aria-hidden />
    </button>
    <div id={id}>{open && <div className="pt-2">{children}</div>}</div>
  </section>
}
