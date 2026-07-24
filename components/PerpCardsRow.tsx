import React from 'react';
import { usePrices } from '../hooks/usePrices';
import { COINS, type Coin } from '../services/pricesService';
import type { PerpDirection } from '../services/perpService';
import PerpCoinCard from './PerpCoinCard';

// The row of square coin prediction cards shown at the top of the "All" view.
// Polls prices only while mounted (i.e. only on the All tab).
const PerpCardsRow: React.FC<{ onTrade: (coin: Coin, direction: PerpDirection) => void }> = ({ onTrade }) => {
  const { prices } = usePrices(5000);

  return (
    <section className="mb-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {COINS.map((c) => (
          <PerpCoinCard key={c} coin={c} price={prices[c]} onTrade={onTrade} />
        ))}
      </div>
    </section>
  );
};

export default PerpCardsRow;
