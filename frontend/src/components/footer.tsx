import React from 'react'
import { LogoIcon } from './Icons'

const footer = () => {
  return (
   <footer className="py-8 border-t border-hairline">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
             <div className="flex items-center gap-2">
               <LogoIcon className="h-5 w-5 text-primary" />
               <span className="text-sm text-ink-subtle font-medium">UnBind</span>
             </div>
             <p className="text-xs text-ink-tertiary">
                UnBind is not a substitute for legal counsel.
             </p>
           </div>
         </footer>
  )
}

export default footer
