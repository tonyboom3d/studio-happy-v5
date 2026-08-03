import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import WorkshopBooking from './pages/WorkshopBooking';
import CandelsBooking from './pages/candels/CandelsBooking';
import BookingSummary from './pages/BookingSummary';
import OrderPage from './pages/OrderPage';
import { useEffect } from 'react';
import { initWixBridge } from '@/api/wixBridge';
import { addLog } from '@/components/VersionLogger';

function AppContent() {
  const location = useLocation();
  const isSummaryPage = location.pathname === '/summary';

  useEffect(() => {
    initWixBridge();
    if (!isSummaryPage) {
      addLog('App initialized', 'success');
    }
  }, [isSummaryPage]);

  return (
    <>
      <Routes>
        <Route path="/summary" element={<BookingSummary />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/select/:token" element={<OrderPage />} />
        <Route path="/candels" element={<CandelsBooking />} />
        <Route path="*" element={<WorkshopBooking />} />
      </Routes>
      {!isSummaryPage && <Toaster />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <AppContent />
      </Router>
    </QueryClientProvider>
  )
}

export default App
