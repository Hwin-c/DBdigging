import React, { useState, useMemo } from 'react';
import { MOCK_NODES } from '../mockData';
import { NodeData } from '../types';

interface SearchBarProps {
  onNodeSelect?: (node: NodeData) => void;
}

export function SearchBar({ onNodeSelect }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return MOCK_NODES.filter(node => 
      node.name.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleSelect = (node: NodeData) => {
    setIsOpen(false);
    setSearchQuery('');
    if (onNodeSelect) {
      onNodeSelect(node);
    }
  };

  const getTags = (node: NodeData) => {
    if (node.type === 'song') return 'ambient · electronic · shoegaze';
    if (node.type === 'artist') return 'pop · k-pop · idol';
    if (node.type === 'sub_genre') return 'electronic · experimental';
    return 'genre';
  };

  return (
    <div className="relative w-[500px]">
      <div className="relative">
        {/* Glow corner dots */}
        <div className="absolute top-0 left-0 w-1 h-1 bg-white rounded-full shadow-[0_0_5px_white] transform -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute top-0 right-0 w-1 h-1 bg-white rounded-full shadow-[0_0_5px_white] transform translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-1 h-1 bg-white rounded-full shadow-[0_0_5px_white] transform -translate-x-1/2 translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-1 h-1 bg-white rounded-full shadow-[0_0_5px_white] transform translate-x-1/2 translate-y-1/2"></div>
        
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder="Search tracks, genres..."
          className="w-full bg-black/40 text-white pl-12 pr-4 py-3 text-sm focus:outline-none placeholder-white/30 border border-white/20 rounded-full font-mono tracking-wide"
        />
      </div>
      
      {isOpen && searchQuery.trim() !== '' && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          
          <div className="absolute top-full left-0 mt-4 w-[600px] -ml-[50px] bg-black/80 backdrop-blur-xl text-white z-50 flex flex-col border border-white/20 rounded-[2rem] p-6 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
            <div className="flex justify-between items-center mb-6 pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_5px_white]"></div>
                <span className="text-xs tracking-[0.2em] font-serif uppercase text-white/70">Search Results</span>
              </div>
              <span className="text-xs text-white/30">{searchResults.length} results</span>
            </div>

            {searchResults.length === 0 ? (
              <div className="py-8 text-center text-white/50 font-serif tracking-widest">
                NO RESULTS
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {searchResults.map((node) => (
                  <button 
                    key={node.id}
                    onClick={() => handleSelect(node)}
                    className="flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/10 group text-left"
                  >
                    <div className="flex items-center gap-6">
                      <div className="relative flex items-center justify-center w-12 h-12">
                        <div className="absolute inset-0 border border-white/20 rounded-full group-hover:border-white/40 transition-colors"></div>
                        <div className="absolute inset-2 border border-white/10 rounded-full border-dashed group-hover:animate-spin-slow"></div>
                        <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_5px_white]"></div>
                      </div>
                      
                      <div className="flex flex-col">
                        <span className="text-xl font-medium mb-1">{node.name}</span>
                        <span className="text-sm text-white/70 mb-2">{node.type === 'song' ? 'Artist Name' : node.type === 'artist' ? 'Artist' : 'Genre'}</span>
                        <span className="text-xs text-white/40">{getTags(node)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <span className="px-4 py-1 text-xs tracking-widest uppercase border border-white/30 rounded-full text-white/70 group-hover:text-white group-hover:border-white/60 transition-colors">
                        {node.type === 'song' ? 'TRACK' : node.type === 'artist' ? 'ARTIST' : 'GENRE'}
                      </span>
                      <div className="w-1 h-1 bg-white rounded-full shadow-[0_0_5px_white]"></div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            <div className="mt-8 pt-6 border-t border-white/10 flex flex-col items-center justify-center gap-3">
              <span className="text-xs tracking-[0.2em] uppercase text-white/40">Explore More</span>
              <div className="w-1 h-1 bg-white rounded-full shadow-[0_0_5px_white]"></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

