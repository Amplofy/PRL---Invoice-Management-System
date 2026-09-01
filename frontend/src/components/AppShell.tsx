import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import QuickTools from './ui/QuickTools'

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="relative z-10 min-h-screen">
      <Sidebar />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Header />
        <main
          key={pathname}
          className="page-enter mx-auto w-full max-w-[1560px] flex-1 px-4 py-6 pb-24 md:px-7 lg:px-9 lg:py-8 lg:pb-24"
        >
          {children}
        </main>
      </div>
      <QuickTools />
    </div>
  )
}
