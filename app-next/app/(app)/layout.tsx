import { Sidebar } from '@/components/layout/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#eceef1' }}>
      <Sidebar active="/dashboard" />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
