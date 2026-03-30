import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import { Differential } from '@/components/sections/Differential';

export default function Home() {
  return (
    <main className="flex flex-col min-h-screen">
      <Navbar />
      <Hero />
      <Services />
      <Differential />
      <Footer />
    </main>
  );
}
