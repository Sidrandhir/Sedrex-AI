import React, { useState } from 'react';
import { Icons } from '../constants';

interface MobileOnboardingProps {
  onComplete: () => void;
}

const MobileOnboarding: React.FC<MobileOnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Sedrex",
      desc: "Your AI assistant, designed for mobile. Chat with multiple AI models in one place.",
      icon: <Icons.Robot className="w-8 h-8 text-emerald-500" />
    },
    {
      title: "Quick Navigation",
      desc: "Swipe right from the left edge to see your chat history. Swipe left to hide it.",
      icon: <Icons.PanelLeftOpen className="w-8 h-8 text-indigo-500" />
    },
    {
      title: "Handy Shortcuts",
      desc: "Long-press any message to quickly copy text or regenerate a response.",
      icon: <Icons.Sparkles className="w-8 h-8 text-amber-500" />
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else onComplete();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-sm bg-[#171717] rounded-[2.5rem] border border-white/5 p-10 flex flex-col items-center text-center shadow-2xl">
        <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/5 flex items-center justify-center mb-8">
          {steps[step].icon}
        </div>
        
        <h2 className="text-2xl font-black tracking-tight text-white uppercase italic mb-4">
          {steps[step].title}
        </h2>
        
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-10 opacity-70">
          {steps[step].desc}
        </p>

        <div className="flex gap-2 mb-10">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 rounded-full transition-all ${i === step ? 'w-8 bg-emerald-500' : 'w-2 bg-white/10'}`} />
          ))}
        </div>

        <button 
          onClick={handleNext}
          className="w-full py-4 bg-emerald-500 rounded-2xl text-white font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
        >
          {step === steps.length - 1 ? 'Get Started' : 'Next'}
        </button>
        
        <button 
          onClick={onComplete}
          className="mt-4 text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-40 hover:opacity-100"
        >
          Skip All
        </button>
      </div>
    </div>
  );
};

export default MobileOnboarding;