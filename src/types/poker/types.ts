import { TLibUserUser } from "../../lib/user/lib";

export type TPokerPgRoomSchema = {
   rid: string;
   status: string;
   players: (string | null)[];
   data: string;
   last_update: number;
   post_actions: string[] | null;
};
export type TPokerPostActionParsed = {
   type: "rabbit" | "show";
   seat?: number;
};

export type TPokerPlayerAction = "call" | "fold" | "check" | "raise" | null;

export type TPokerRoomData = {
   //@ ROOM LEVEL
   rid: string;
   created_by: string;
   created_at: string;
   scoreboard: TPokerScoreboardLine[];

   //@ GAME LEVEL
   round: TPokerRound;
   nextTimeOut: number;
   queued_actions: {
      sub: string;
      action: "stand-up";
   }[];
   //*                                  [0   , null , null, 3,    4,    null, null, 7,    null]
   // sit_players : string[] // sub[] : [sub1, null , null, sub2, sub3, null, null, sub4, null]
   game_players: (TLibUserUser | null)[];

   // ? sb seat index
   sb_index: number; // sub2 : 3

   // ? array of seat indices
   play_order: number[]; // sub index[] : [4 , 7, 0, 3] => [0 , 3, 4, 7]

   // ? index of the current possition in play_order
   play_order_index: number; // order index : 0

   player_action: TPokerPlayerAction;
   previous_player_action: TPokerPlayerAction;
   player_action_amount: number | null;
   players_action: TPokerPlayerAction[];
   winnerSeats: number[];

   community_cards: string[]; // [3h,Jd,As,Qc] (turn)
   deck: string[]; // [As,...] //@SENSITIVE
   player_hands: (TPokerPlayerHand | null)[]; //@SENSITIVE

   pot: (number | null)[]; // [60, null, null,60,60, null, null,60, null]
   stake: number; // 0
   //*                     0              3  4              7
   round_pot: (number | null)[]; //[30, null, null,30,30, null, null,30, null]
};

export type TPokerScoreboardLine = {
   sub: string;
   name: string;
   alpha: number;
};

export type TPokerRound = "pre" | "flop" | "turn" | "river" | "post";

export type TPokerPlayerHand = {
   cards: string[];
   combo: string[];
   name: string;
   desc: string;
   rank: number;
   show?: boolean;
};
