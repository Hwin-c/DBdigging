import React, { useMemo, useState, useRef } from 'react';
import { AudioFeatures } from '../types';
import { GlassPanel } from './GlassPanel';
import { CustomResponsiveContainer } from './CustomResponsiveContainer';
import { CockpitRadarChart } from './CockpitRadarChart';

// 오디오 특성 한국어 설명 데이터셋
const FEATURE_DESCRIPTIONS = {
  acousticness: {
    title: 'Acoustic (어쿠스틱 감도)',
    desc: '곡에 전자 악기 대신 어쿠스틱 악기(통기타, 피아노 등)가 사용된 비율을 나타냅니다. 100%에 가까울수록 순수 자연 악기 소리에 가깝습니다.'
  },
  danceability: {
    title: 'Dance (댄스 적합도)',
    desc: '템포, 리듬 안정성, 비트 강도 등을 분석하여 춤추기에 얼마나 적합한지를 나타냅니다. 100%에 가까울수록 춤추기 좋은 리드미컬한 곡입니다.'
  },
  energy: {
    title: 'Energy (에너지 강도)',
    desc: '곡의 역동성과 활동성을 나타냅니다. 빠르고 시끄럽고 강한 비트일수록 높은 값을 가지며, 100%에 가까울수록 폭발적인 에너지를 뿜어냅니다.'
  },
  instrumentalness: {
    title: 'Instrument (음성 부재율)',
    desc: '곡에 보컬(목소리) 없이 악기 소리만 채워진 비율을 나타냅니다. 100%에 가까울수록 보컬 비중이 없는 순수 연주곡(Instrumental)에 가깝습니다.'
  },
  speechiness: {
    title: 'Speech (발화 밀도)',
    desc: '곡에서 말소리(랩, 대사, 말)가 차지하는 비중을 나타냅니다. 100%에 가까울수록 음악 연주보다 사람의 목소리와 가사 전달 중심의 곡입니다.'
  },
  valence: {
    title: 'Valence (음악적 밝기)',
    desc: '음악이 전달하는 감정의 긍정적인 정도를 나타냅니다. 100%에 가까울수록 밝고 행복하며 신나는 느낌을, 0%에 가까울수록 어둡고 슬프고 우울한 느낌을 줍니다.'
  }
};

interface RightPanelProps {
  title: string;
  subtitle: string;
  features: AudioFeatures;
  compareFeatures?: AudioFeatures;
  featuresLabel?: string;
  compareFeaturesLabel?: string;
}

export const RightPanel: React.FC<RightPanelProps> = ({ title, subtitle, features, compareFeatures, featuresLabel, compareFeaturesLabel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<{
    key: string;
    x: number;
    y: number;
    arrowOffset: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  if (!features) return null;

  const formatPercent = (val?: number) => val ? `${Math.round(val * 100)}%` : '0%';

  const handleShowTooltip = (key: string, e: React.MouseEvent<HTMLElement | SVGElement> | React.TouchEvent<HTMLElement | SVGElement>) => {
    if (!containerRef.current) return;
    const target = e.currentTarget as HTMLElement | SVGElement;
    const containerRect = containerRef.current.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    
    // 1. Calculate target center X and top Y coordinates relative to panel container
    const targetX = targetRect.left - containerRect.left + targetRect.width / 2;
    const targetY = targetRect.top - containerRect.top;
    
    // 2. Define safe boundaries (12px padding from left/right edges)
    const tooltipWidth = 256; // w-64 is 256px
    const halfWidth = tooltipWidth / 2;
    const padding = 12;
    const minX = halfWidth + padding;
    const maxX = containerRect.width - halfWidth - padding;
    
    // 3. Clamp tooltip center X coordinate within safe boundaries
    const clampedX = Math.max(minX, Math.min(maxX, targetX));
    
    // 4. Calculate arrow pointer offset relative to tooltip center
    const arrowOffset = targetX - clampedX;
    
    // 5. Automatic vertical flipping threshold (if target is in upper 140px)
    const isHigh = targetY < 140;
    const placement = isHigh ? 'bottom' : 'top';
    const finalY = isHigh ? (targetRect.bottom - containerRect.top) : targetY;
    
    setActiveTooltip({
      key,
      x: clampedX,
      y: finalY,
      arrowOffset,
      placement
    });
  };

  const handleHideTooltip = () => {
    setActiveTooltip(null);
  };

  const handleToggleTooltip = (key: string, e: React.MouseEvent<HTMLElement | SVGElement> | React.TouchEvent<HTMLElement | SVGElement>) => {
    e.stopPropagation();
    if (e.type === 'touchstart' && e.cancelable) {
      e.preventDefault();
    }
    if (activeTooltip && activeTooltip.key === key) {
      handleHideTooltip();
    } else {
      handleShowTooltip(key, e);
    }
  };

  return (
    <GlassPanel 
      ref={containerRef}
      onMouseLeave={handleHideTooltip}
      onClick={handleHideTooltip}
      className="w-full h-full text-white z-20 shadow-2xl flex flex-col justify-between select-none"
    >
      <div className="flex-1 min-h-0 w-full p-4 flex flex-col justify-between relative">
        <h2 className="text-xl font-medium mb-1">{title}</h2>
        <div className="text-xs text-white/50 mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 bg-[#8B5CF6]/50 border border-[#8B5CF6] rounded-sm" />
            <span>{featuresLabel || subtitle}</span>
          </div>
          {compareFeatures && compareFeaturesLabel && (
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 bg-[#10B981]/50 border border-[#10B981] rounded-sm" />
              <span>{compareFeaturesLabel}</span>
            </div>
          )}
        </div>

        <div className="w-full flex-1 min-h-0 mb-4 relative flex items-center justify-center">
          <CustomResponsiveContainer>
            {(width, height) => (
              <CockpitRadarChart 
                width={width} 
                height={height} 
                features={features} 
                compareFeatures={compareFeatures} 
                onLabelHover={handleShowTooltip}
                onLabelLeave={handleHideTooltip}
                onLabelClick={handleToggleTooltip}
              />
            )}
          </CustomResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-y-4 gap-x-2 text-center text-sm">
          <div 
            className="relative group cursor-help select-none"
            onMouseEnter={(e) => handleShowTooltip('acousticness', e)}
            onMouseLeave={handleHideTooltip}
            onClick={(e) => handleToggleTooltip('acousticness', e)}
            onTouchStart={(e) => handleToggleTooltip('acousticness', e)}
          >
            <div className="font-medium text-[#8B5CF6]">{formatPercent(features.acousticness)}</div>
            {compareFeatures && <div className="font-medium text-[#10B981] text-xs">{formatPercent(compareFeatures.acousticness)}</div>}
            <div className="text-white/40 group-hover:text-[#00FFFF] text-[10px] mt-1 underline decoration-dotted decoration-white/20 transition-all duration-300">Acoustic</div>
          </div>
          <div 
            className="relative group cursor-help select-none"
            onMouseEnter={(e) => handleShowTooltip('danceability', e)}
            onMouseLeave={handleHideTooltip}
            onClick={(e) => handleToggleTooltip('danceability', e)}
            onTouchStart={(e) => handleToggleTooltip('danceability', e)}
          >
            <div className="font-medium text-[#8B5CF6]">{formatPercent(features.danceability)}</div>
            {compareFeatures && <div className="font-medium text-[#10B981] text-xs">{formatPercent(compareFeatures.danceability)}</div>}
            <div className="text-white/40 group-hover:text-[#00FFFF] text-[10px] mt-1 underline decoration-dotted decoration-white/20 transition-all duration-300">Dance</div>
          </div>
          <div 
            className="relative group cursor-help select-none"
            onMouseEnter={(e) => handleShowTooltip('energy', e)}
            onMouseLeave={handleHideTooltip}
            onClick={(e) => handleToggleTooltip('energy', e)}
            onTouchStart={(e) => handleToggleTooltip('energy', e)}
          >
            <div className="font-medium text-[#8B5CF6]">{formatPercent(features.energy)}</div>
            {compareFeatures && <div className="font-medium text-[#10B981] text-xs">{formatPercent(compareFeatures.energy)}</div>}
            <div className="text-white/40 group-hover:text-[#00FFFF] text-[10px] mt-1 underline decoration-dotted decoration-white/20 transition-all duration-300">Energy</div>
          </div>
          <div 
            className="relative group cursor-help select-none"
            onMouseEnter={(e) => handleShowTooltip('instrumentalness', e)}
            onMouseLeave={handleHideTooltip}
            onClick={(e) => handleToggleTooltip('instrumentalness', e)}
            onTouchStart={(e) => handleToggleTooltip('instrumentalness', e)}
          >
            <div className="font-medium text-[#8B5CF6]">{formatPercent(features.instrumentalness)}</div>
            {compareFeatures && <div className="font-medium text-[#10B981] text-xs">{formatPercent(compareFeatures.instrumentalness)}</div>}
            <div className="text-white/40 group-hover:text-[#00FFFF] text-[10px] mt-1 underline decoration-dotted decoration-white/20 transition-all duration-300">Instrument</div>
          </div>
          <div 
            className="relative group cursor-help select-none"
            onMouseEnter={(e) => handleShowTooltip('speechiness', e)}
            onMouseLeave={handleHideTooltip}
            onClick={(e) => handleToggleTooltip('speechiness', e)}
            onTouchStart={(e) => handleToggleTooltip('speechiness', e)}
          >
            <div className="font-medium text-[#8B5CF6]">{formatPercent(features.speechiness)}</div>
            {compareFeatures && <div className="font-medium text-[#10B981] text-xs">{formatPercent(compareFeatures.speechiness)}</div>}
            <div className="text-white/40 group-hover:text-[#00FFFF] text-[10px] mt-1 underline decoration-dotted decoration-white/20 transition-all duration-300">Speech</div>
          </div>
          <div 
            className="relative group cursor-help select-none"
            onMouseEnter={(e) => handleShowTooltip('valence', e)}
            onMouseLeave={handleHideTooltip}
            onClick={(e) => handleToggleTooltip('valence', e)}
            onTouchStart={(e) => handleToggleTooltip('valence', e)}
          >
            <div className="font-medium text-[#8B5CF6]">{formatPercent(features.valence)}</div>
            {compareFeatures && <div className="font-medium text-[#10B981] text-xs">{formatPercent(compareFeatures.valence)}</div>}
            <div className="text-white/40 group-hover:text-[#00FFFF] text-[10px] mt-1 underline decoration-dotted decoration-white/20 transition-all duration-300">Valence</div>
          </div>
        </div>

        {/* 프리미엄 네온 글래스모픽 툴팁 말풍선 */}
        {activeTooltip && (
          <div 
            className={`absolute z-[999] -translate-x-1/2 p-3 rounded-2xl bg-black/90 backdrop-blur-lg border border-[#00FFFF]/45 shadow-[0_4px_30px_rgba(0,255,255,0.15)] text-left w-64 pointer-events-none transition-all duration-300 ${
              activeTooltip.placement === 'bottom' ? 'translate-y-0 mt-3' : '-translate-y-full mb-3'
            }`}
            style={{ 
              left: `${activeTooltip.x}px`, 
              top: `${activeTooltip.y}px`,
              filter: 'drop-shadow(0 0 10px rgba(0, 255, 255, 0.25))'
            }}
          >
            {/* 말풍선 꼬리 */}
            {activeTooltip.placement === 'bottom' ? (
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full w-0 h-0 border-x-[8px] border-x-transparent border-b-[8px] border-b-black/90" 
                style={{ 
                  left: `calc(50% + ${activeTooltip.arrowOffset}px)`,
                  filter: 'drop-shadow(0 -1px 0 rgba(0, 255, 255, 0.45))' 
                }}
              />
            ) : (
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-x-[8px] border-x-transparent border-t-[8px] border-t-black/90" 
                style={{ 
                  left: `calc(50% + ${activeTooltip.arrowOffset}px)`,
                  filter: 'drop-shadow(0 1px 0 rgba(0, 255, 255, 0.45))' 
                }}
              />
            )}
            
            <div className="text-xs font-bold text-[#00FFFF] mb-1 font-mono tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00FFFF] animate-ping shrink-0" />
              {FEATURE_DESCRIPTIONS[activeTooltip.key as keyof typeof FEATURE_DESCRIPTIONS].title}
            </div>
            <div className="text-[11px] text-white/85 leading-relaxed font-sans font-normal tracking-wide">
              {FEATURE_DESCRIPTIONS[activeTooltip.key as keyof typeof FEATURE_DESCRIPTIONS].desc}
            </div>
          </div>
        )}
      </div>
    </GlassPanel>
  );
};
