import { SpaceBackground } from '../ui/SpaceBackground';
import type { es } from '@/i18n/dictionaries/es';

type Dictionary = typeof es;

export function Differential({ dict }: { dict: Dictionary }) {
  return (
    <section
      id="diferencial"
      className="min-h-screen flex flex-col justify-center pt-28 pb-12 relative overflow-hidden bg-gradient-to-br from-[#00213d] via-[#00172B] to-black"
    >
      <SpaceBackground />
      <div className="absolute inset-0 z-0 pointer-events-none opacity-25 bg-[radial-gradient(circle_at_center,rgba(255,45,0,0.15)_0%,transparent_55%)]" />
      <div className="max-w-[1440px] px-6 mx-auto w-full relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-8">
              {dict.differential.heading1}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-400 to-white">
                {dict.differential.heading2}
              </span>
            </h2>
            <div className="space-y-8">
              <div className="relative pl-6 border-l border-white/20 hover:border-[#FF2D00] transition-colors duration-500">
                <h4 className="text-xl font-medium text-white mb-2">
                  {dict.differential.items[0].title}
                </h4>
                <p className="text-white/60 font-light leading-relaxed">
                  {dict.differential.items[0].description}
                </p>
              </div>

              <div className="relative pl-6 border-l border-white/20 hover:border-[#FF2D00] transition-colors duration-500">
                <h4 className="text-xl font-medium text-white mb-2">
                  {dict.differential.items[1].title}
                </h4>
                <p className="text-white/60 font-light leading-relaxed">
                  {dict.differential.items[1].description}
                </p>
              </div>
            </div>
          </div>

          <div className="lg:w-1/2 w-full flex justify-center">
            {/* Visual representation of 'Security by Design' */}
            <div className="relative w-full max-w-md aspect-square rounded-full border border-white/5 flex items-center justify-center">
              <div className="absolute inset-x-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#FF2D00]/30 to-transparent" />
              <div className="absolute inset-y-0 h-full w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent" />
              <div className="w-3/4 h-3/4 rounded-full border border-white/10 flex items-center justify-center">
                <div className="w-1/2 h-1/2 rounded-full border border-[#FF2D00]/40 flex items-center justify-center animate-[pulse_4s_ease-in-out_infinite]">
                  <div className="w-2 h-2 rounded-full bg-[#FF2D00] animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
