import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { ThemeProvider } from './theme'
import { ToastProvider } from './components/ui/Toast'
import { AuthProvider } from './lib/auth'
import BootScreen from './components/ui/BootScreen'
import AppShell from './components/AppShell'
import AuthGuard from './components/AuthGuard'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import InvoicesPage from './pages/InvoicesPage'
import InvoiceWorkspacePage from './pages/InvoiceWorkspacePage'
import WorkflowPage from './pages/WorkflowPage'
import ApprovalsPage from './pages/ApprovalsPage'
import PaymentOrdersPage from './pages/PaymentOrdersPage'
import PoHistoryPage from './pages/PoHistoryPage'
import ContractsPage from './pages/ContractsPage'
import ReportsPage from './pages/ReportsPage'
import AuditLogPage from './pages/AuditLogPage'
import ImportPage from './pages/ImportPage'
import FollowupsPage from './pages/FollowupsPage'
import ComparePage from './pages/ComparePage'
import AdminPage from './pages/AdminPage'
import UsersPage from './pages/UsersPage'

function ProtectedLayout() {
  return (
    <AuthGuard>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGuard>
  )
}

function ProtectedAdminLayout() {
  return (
    <AuthGuard adminOnly>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGuard>
  )
}

export default function App() {
  const [booting, setBooting] = useState(() => {
    try {
      return sessionStorage.getItem('prl-eoms-booted') !== '1'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem('prl-eoms-booted', '1')
    } catch {
      // ignore
    }
  }, [])

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          {booting && <BootScreen onDone={() => setBooting(false)} />}
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<ProtectedLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="control-tower" element={<DashboardPage />} />
                <Route path="invoices" element={<InvoicesPage />} />
                <Route path="invoices/:id" element={<InvoiceWorkspacePage />} />
                <Route path="workflow" element={<WorkflowPage />} />
                <Route path="approvals" element={<ApprovalsPage />} />
                <Route path="payment-orders" element={<PaymentOrdersPage />} />
                <Route path="po-history" element={<PoHistoryPage />} />
                <Route path="contracts" element={<ContractsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="audit-log" element={<AuditLogPage />} />
                <Route path="import" element={<ImportPage />} />
                <Route path="followups" element={<FollowupsPage />} />
                <Route path="compare" element={<ComparePage />} />
              </Route>
              <Route path="/admin" element={<ProtectedAdminLayout />}>
                <Route index element={<AdminPage />} />
              </Route>
              <Route path="/users" element={<ProtectedAdminLayout />}>
                <Route index element={<UsersPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/control-tower" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
