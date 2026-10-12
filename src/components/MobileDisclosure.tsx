import {useId,useState,type ReactNode} from 'react'
/** A single content tree: mobile disclosures share a two-column trigger row. */
export function MobileDisclosure({label,children}:{label:string;children:ReactNode}) {
 const [open,setOpen]=useState(false)
 const id=useId()
 return <section className="mobile-disclosure">
  <button type="button" className="toolbar-chip disclosure-trigger min-h-11 justify-center md:hidden" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>{label}<span aria-hidden>{open?' −':' +'}</span></button>
  <div id={id} className={`disclosure-content ${open?'block':'hidden'} md:block`}>{children}</div>
 </section>
}
