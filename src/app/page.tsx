import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import { Products } from '@/components/sections/Products';
import { Differential } from '@/components/sections/Differential';
import { Contact } from '@/components/sections/Contact';

export default function Home() {
  return (
    <main className="flex flex-col min-h-screen">
      <Navbar />
      <Hero />
      <Services />
      <Products />
      <Differential />
      <Contact />
      <Footer />
    </main>
  );
}
