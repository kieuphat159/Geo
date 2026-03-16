interface SosButtonProps {
  onClick?: () => void;
}

export default function SosButton({ onClick }: SosButtonProps) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Pulsing background rings */}
      <div className="absolute h-[min(78vw,360px)] w-[min(78vw,360px)] animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full bg-red-500/30"></div>
      <div className="absolute h-[min(78vw,360px)] w-[min(78vw,360px)] animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_1s_infinite] rounded-full bg-red-400/20"></div>
      
      {/* Main Button */}
      <button
        className="pointer-events-auto relative z-10 flex h-[min(78vw,360px)] w-[min(78vw,360px)] flex-col items-center justify-center rounded-full border-[10px] border-white/20 bg-gradient-to-br from-red-400 via-red-500 to-rose-600 text-white shadow-[0_0_80px_rgba(225,29,72,0.6)] backdrop-blur-md transition-all duration-300 hover:scale-105 hover:shadow-[0_0_100px_rgba(225,29,72,0.8)] active:scale-95"
        type="button"
        onClick={onClick}
        aria-label="SOS khẩn cấp"
      >
        <span className="text-[clamp(1.5rem,6vw,2.5rem)] font-black tracking-widest drop-shadow-md">
          SOS
        </span>
        <span className="mt-1 text-[clamp(0.875rem,3vw,1.25rem)] font-bold uppercase tracking-widest text-red-50 opacity-90">
          Khẩn cấp
        </span>
      </button>
    </div>
  );
}
