import { LandingUI } from '@/components/layout/LandingUI';

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LandingUI />
      {children}
    </>
  );
}
