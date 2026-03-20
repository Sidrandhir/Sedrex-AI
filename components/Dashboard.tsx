
import React from 'react';
import { UserStats, AIModel } from '../types';
import { Icons } from '../constants';

interface DashboardProps {
  stats: UserStats;
  onUpgrade: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ stats, onUpgrade }) => {
  const favoriteModel = Object.entries(stats.modelUsage).length > 0
    ? Object.entries(stats.modelUsage).reduce((a, b) => (a[1] > b[1] ? a : b))[0]
    : 'None yet';
  
  const maxDaily = Math.max(...stats.dailyHistory.map(d => d.count), 5);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 md:p-12 bg-[var(--bg-primary)] font-sans">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 md:space-y-12">
        
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-[var(--border)] pb-6 sm:pb-8 md:pb-12">
          <div className="space-y-2">
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter text-[var(--text-primary)] uppercase italic">Overview</h2>
          </div>
          {stats.tier === 'free' && (
            <button 
              onClick={onUpgrade}
              className="bg-emerald-500 hover:brightness-110 text-white px-6 sm:px-10 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] transition-all shadow-2xl shadow-emerald-500/20 active:scale-95 w-full sm:w-auto"
            >
              Upgrade to Pro
            </button>
          )}
        </header>

        {/* Neural Core Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-[var(--bg-tertiary)]/20 p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-[var(--border)] relative group overflow-hidden">
            <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-[12px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2 relative z-10">Messages This Month</p>
            <div className="flex items-baseline gap-2 relative z-10">
              <p className="text-3xl sm:text-5xl font-black text-[var(--text-primary)]">{stats.monthlyMessagesSent}</p>
              <span className="text-[12px] font-black text-[var(--text-secondary)] uppercase">/ 50</span>
            </div>
            <div className="mt-4 sm:mt-6 md:mt-8 w-full bg-white/5 rounded-full h-1 overflow-hidden relative z-10">
              <div 
                className="bg-emerald-500 h-full transition-all duration-1000 ease-out" 
                style={{ width: `${Math.min((stats.monthlyMessagesSent / 50) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-[var(--bg-tertiary)]/20 p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-[var(--border)] relative group">
             <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-[12px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2 relative z-10">Tokens Used</p>
            <p className="text-3xl sm:text-5xl font-black text-[var(--text-primary)] relative z-10">{(stats.tokensEstimated / 1000).toFixed(1)}k</p>
            <p className="text-[12px] text-[var(--text-secondary)] mt-4 uppercase font-black tracking-wider relative z-10">Total tokens</p>
          </div>

          <div className="bg-[var(--bg-tertiary)]/20 p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-[var(--border)] sm:col-span-2 md:col-span-2 relative group">
            <div className="absolute inset-0 bg-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex justify-between items-start relative z-10">
              <div className="space-y-1">
                <p className="text-[12px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Most Used Model</p>
                <p className="text-2xl sm:text-3xl font-black truncate text-emerald-500 uppercase italic tracking-tighter">{favoriteModel.split(' ').pop()}</p>
              </div>
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/5">
                <Icons.Robot className="w-6 h-6 text-white/20" />
              </div>
            </div>
            <div className="mt-8 flex gap-2">
               {Object.keys(stats.modelUsage).map((m, i) => (
                 <div key={i} className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className="bg-emerald-500/40 h-full" style={{ width: `${(stats.modelUsage[m] / stats.totalMessagesSent) * 100}%` }} />
                 </div>
               ))}
            </div>
          </div>
        </div>

        {/* Activity Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          
          {/* Main Activity Chart */}
          <div className="lg:col-span-2 bg-[var(--bg-tertiary)]/10 p-5 sm:p-8 md:p-10 rounded-2xl sm:rounded-[3rem] border border-[var(--border)]">
            <div className="flex justify-between items-center mb-6 sm:mb-8 md:mb-12">
               <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)]">Daily Activity</h3>

            </div>
            
            <div className="flex items-end gap-1 sm:gap-1.5 h-40 sm:h-52 md:h-64">
              {stats.dailyHistory.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)] uppercase tracking-widest font-black text-[12px] opacity-20">No activity yet</div>
              ) : (
                stats.dailyHistory.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div 
                      className="w-full bg-white/5 group-hover:bg-emerald-500/40 transition-all rounded-t-xl cursor-crosshair relative"
                      style={{ height: `${(day.count / maxDaily) * 100}%` }}
                    >
                       <div className="absolute inset-0 border-t border-white/10" />
                    </div>
                    <div className="absolute bottom-full mb-4 bg-[var(--bg-secondary)] text-white text-[12px] font-black px-4 py-2 rounded-xl border border-[var(--border)] opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 whitespace-nowrap z-20 shadow-2xl uppercase tracking-widest">
                      {day.date}: {day.count} messages
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>

          {/* Side Module: Intelligence Tier */}
          <div className="bg-emerald-500 p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-[3rem] flex flex-col justify-between text-[#0d0d0d] shadow-2xl shadow-emerald-500/20">
             <div>
                <h4 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter uppercase italic leading-none">SEDREX<br/>{stats.tier}</h4>

             </div>
             
             <div className="space-y-4 sm:space-y-6 mt-6 sm:mt-0">
                <div className="p-4 sm:p-6 bg-white/10 rounded-2xl sm:rounded-3xl border border-white/10">
                   <p className="text-[12px] font-black uppercase mb-1">Uptime</p>
                   <p className="text-lg sm:text-xl font-black uppercase italic">99.8%</p>
                </div>
                {stats.tier === 'free' ? (
                  <button onClick={onUpgrade} className="w-full py-4 bg-[#0d0d0d] text-white text-[12px] font-black uppercase tracking-[0.2em] rounded-2xl hover:scale-105 transition-all">
                    Unlock Unlimited
                  </button>
                ) : (
                  <div className="text-center py-4 text-[12px] font-black uppercase tracking-widest opacity-40">Pro Subscribed</div>
                )}
             </div>
          </div>

        </div>



      </div>
    </div>
  );
};

export default Dashboard;
