export type TPokerSolverSolve = (cards: string[]) => TPokerSolverSolved;
export type TPokerSolverSolved = {
   cardPool: TPokerSolverCard[];
   cards: TPokerSolverCard[];
   suits: {
      d?: TPokerSolverCard[];
      s?: TPokerSolverCard[];
      c?: TPokerSolverCard[];
      h?: TPokerSolverCard[];
   };
   values: TPokerSolverCard[][];
   wilds: any[];
   name: string;
   descr: string;
   game: { [x: string]: any };
   sfLength: number;
   alwaysQualifies: boolean;
   rank: number;
   isPossible: boolean;
};
export type TPokerSolverCard = {
   value: string;
   suit: string;
   rank: number;
   wildValue: string;
};
