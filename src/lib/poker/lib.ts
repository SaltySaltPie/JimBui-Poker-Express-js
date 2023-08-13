// @ts-ignore
import { Hand } from "pokersolver";
import { RemoteSocket } from "socket.io";
import { io } from "../../app";
import { pgClients } from "../../config/postgres";
import { TUnknownObj, TUserCache } from "../../types/common";
import {
   TPokerPgRoomSchema,
   TPokerPlayerHand,
   TPokerPostActionParsed,
   TPokerRoomData,
   TPokerRound,
   TPokerScoreboardLine,
} from "../../types/poker/types";
import JSONtryParse from "../../utils/js/JSONtryParse";
import { TLibUserUser, libUser_getUsers } from "../user/lib";
import pgInsertOrUpdateOnConflict from "../../utils/postgres/pgInsertOrUpdateOnConflict";
import { TPokerSolverSolved } from "../../types/pokersolver";
import { jsArrayFindNextNonNull } from "../../utils/js/jsArrayFindNextNonNull";

export const libPoker_calculateHands = ({ hands, community_cards = [] }: TLibPoker_calculateHandsParams) =>
   hands.map((cards): TPokerPlayerHand | null => {
      if (!cards) return null;
      const hand: TPokerSolverSolved = Hand.solve([...community_cards, ...cards]);
      return {
         cards,
         combo: hand.cards.map(({ suit, value }) => value + suit),
         desc: hand.descr,
         name: hand.name,
         rank: hand.rank,
      };
   });
type TLibPoker_calculateHandsParams = {
   hands: (string[] | null)[];
   community_cards?: string[];
};

export const libPoker_resolveGameTick = async ({ rid }: TLibPoker_resolveGameTickParams) => {
   const { clientRoom, rawRoom, serverRoom } = await libPoker_getRoomData({ rid });
   const { data, post_action_parsed = [] } = serverRoom;
   const {
      nextTimeOut,
      game_players,
      player_action,
      player_action_amount,
      play_order,
      play_order_index,
      players_action = [...Array(9)].map((_) => null),
      stake,
      pot,
      round_pot = [],
      round,
      deck,
      community_cards = [],
      player_hands,
      sb_index,
      scoreboard = [],
   } = data;
   const isTimedOut = Date.now() - nextTimeOut > 2000;

   // if (round === "post" && isTimedOut)
   //    return libPoker_startRoom({ rid });

   if (!player_action && !isTimedOut) {
      // setTimeout(() => libPoker_resolveGameTick({ rid }), 1000);
      //TODO: polling logic here
      return;
   }

   const seatIndex = play_order[play_order_index];

   let next_pot = pot;
   let next_round_pot = round_pot;
   let next_stake = stake;
   let next_play_order = play_order;
   let next_play_order_index = play_order_index;
   let next_nextTimeOut = Date.now() + 1000 * 10;
   let next_round = round;
   let next_deck = deck;
   let next_community_cards = community_cards;
   let next_player_hands = player_hands;
   let next_scoreboard = scoreboard;
   let next_players_action = players_action;
   let next_winnerSeats: number[] = [];

   if (player_action === "call") {
      next_round_pot.splice(seatIndex, 1, stake);
      next_players_action.splice(seatIndex, 1, "call");
   }
   if (player_action === "check") {
      next_play_order_index === play_order_index + 1;
      next_players_action.splice(seatIndex, 1, "check");
   }
   if (
      player_action === "fold"
      // * timeout logic here
      // || isTimedOut
   ) {
      next_play_order = next_play_order.filter((seatNum) => seatNum !== seatIndex);
      next_players_action.splice(seatIndex, 1, "fold");
   }
   if (player_action === "raise") {
      next_stake = stake + (player_action_amount || 0);
      next_round_pot.splice(seatIndex, 1, next_stake);

      next_play_order = [...play_order.slice(play_order_index), ...play_order.slice(0, play_order_index)];
      next_players_action = [...Array(9)].map((_, i) => (i === seatIndex ? "raise" : null));
      next_play_order_index = 1;
   }

   const handleWinners = () => {
      console.log("Handling Winners!");
      console.log({ next_pot_after: next_pot });

      next_pot.forEach((potAmount, seat) => {
         if (!potAmount) return;
         console.log({ next_scoreboard_before: next_scoreboard });
         const player = game_players[seat] as TLibUserUser;
         const scoreboardLineIndex = scoreboard.findIndex((scEntry) => scEntry.sub === player.sub);
         const scoreboardLine: TPokerScoreboardLine =
            scoreboardLineIndex > -1
               ? scoreboard[scoreboardLineIndex]
               : { sub: player.sub, name: player.name || player.sub, alpha: 0 };
         const new_scoreboardLine = { ...scoreboardLine, alpha: scoreboardLine.alpha - potAmount };
         if (scoreboardLineIndex > -1) next_scoreboard.splice(scoreboardLineIndex, 1, new_scoreboardLine);
         else next_scoreboard.push(new_scoreboardLine);
      });

      const winningCards: string[] = Hand.winners(
         next_play_order
            .map((seatIndex) => next_player_hands[seatIndex] as TPokerPlayerHand)
            .map(({ cards }) => Hand.solve([...cards, ...next_community_cards]))
      )
         .map(({ cards }: TPokerSolverSolved) => cards.map((card) => card.value + card.suit))
         .flat();
      console.log({ winningCards, next_community_cards });
      next_winnerSeats = [];
      if (next_play_order.length === 1) {
         next_winnerSeats.push(next_play_order[0]);
      } else {
         next_play_order.forEach((seatIndex) => {
            const hand = next_player_hands[seatIndex]?.cards || [];
            if (hand.some((card) => winningCards.includes(card))) next_winnerSeats.push(seatIndex);
         });
      }
      if (next_play_order.length > 1)
         next_player_hands = next_player_hands.map((hand, i) =>
            next_play_order.includes(i) && hand ? { ...hand, show: true, winner: true } : hand
         );
      const totalPot = next_pot.reduce((prev, curr) => (prev || 0) + (curr || 0), 0) as number;

      console.log({ next_winning_seat: next_winnerSeats, totalPot });
      next_winnerSeats.forEach((seatIndex) => {
         const player = game_players[seatIndex] as TLibUserUser;
         const scoreboardLineIndex = scoreboard.findIndex((scEntry) => scEntry.sub === player.sub);
         const scoreboardLine: TPokerScoreboardLine =
            scoreboardLineIndex > -1
               ? scoreboard[scoreboardLineIndex]
               : { sub: player.sub, name: player.name || player.sub, alpha: 0 };
         const new_scoreboardLine = { ...scoreboardLine, alpha: scoreboardLine.alpha + totalPot };
         console.log({ new_scoreboardLine });
         if (scoreboardLineIndex > -1) next_scoreboard.splice(scoreboardLineIndex, 1, new_scoreboardLine);
         else next_scoreboard.push(new_scoreboardLine);
      });
   };

   if (next_play_order.length === 1 && next_round !== "post") {
      next_round = "post";
      next_pot = next_round_pot.map((seatPot, i) => (seatPot != null ? seatPot + (next_pot[i] || 0) : next_pot[i]));
      console.log({ next_pot_before: next_pot });
      handleWinners();
   }

   const isLastPlayerOrder = play_order_index === play_order.length - 1;
   if (round === "post") {
      post_action_parsed.forEach((action) => {
         if (action.type === "rabbit" && next_community_cards.length < 5) {
            const newCards = next_deck.splice(0, 5 - next_community_cards.length);
            next_community_cards.push(...newCards);
         }
      });
   } else if (isLastPlayerOrder && player_action !== "raise" && next_play_order.length > 1) {
      console.log(`Last play order`);
      next_players_action = [...Array(9)].map(() => null);
      next_stake = 0;
      next_round =
         round === "pre"
            ? "flop"
            : round === "flop"
            ? "turn"
            : round === "turn"
            ? "river"
            : round === "river"
            ? "post"
            : "pre";
      const goFirstSeat = next_play_order.includes(sb_index)
         ? sb_index
         : next_play_order.reduce((prev, curr) => (curr > sb_index ? (curr < prev ? curr : prev) : 0), 0) ||
           Math.min(...next_play_order);
      const goFirstSeatIndex = next_play_order.findIndex((seat) => seat === goFirstSeat);
      next_play_order = [...next_play_order.slice(goFirstSeatIndex), ...next_play_order.slice(0, goFirstSeatIndex)];
      next_play_order_index = 0;

      next_pot = next_round_pot.map((seatPot, i) => (seatPot != null ? seatPot + (next_pot[i] || 0) : next_pot[i]));

      if (next_round === "flop") next_community_cards.push(...next_deck.splice(0, 3));
      if (next_round === "turn") next_community_cards.push(...next_deck.splice(0, 1));
      if (next_round === "river") next_community_cards.push(...next_deck.splice(0, 1));
      next_player_hands = libPoker_calculateHands({
         hands: next_player_hands.map((hand) => (hand ? hand.cards : null)),
         community_cards: next_community_cards,
      });

      next_round_pot = [...Array(9)].map(() => 0);

      if (next_round === "post") {
         next_play_order_index = -1;
         next_players_action = [...Array(9)].map(() => null);
         //* get player ranking
         handleWinners();
      }
   } else if (player_action !== "raise") {
      next_play_order_index = play_order_index + 1;
   }

   const next_RoomData: TPokerRoomData = {
      ...data,
      pot: next_pot,
      round_pot: next_round_pot,
      stake: next_stake,
      play_order: next_play_order,
      play_order_index: next_play_order_index,
      player_action: null,
      previous_player_action: player_action,
      player_action_amount: null,
      players_action: next_players_action,
      nextTimeOut: next_nextTimeOut,
      round: next_round,
      deck: next_deck,
      community_cards: next_community_cards,
      player_hands: next_player_hands,
      scoreboard: next_scoreboard,
      winnerSeats: next_winnerSeats,
   };
   console.log({ next_RoomData });
   const pgPayload: { rid: string; data: TPokerRoomData; previous_data: TPokerRoomData } = {
      rid,
      data: next_RoomData,
      previous_data: data,
   };

   await pgInsertOrUpdateOnConflict({
      client: "casino",
      columns: Object.keys(pgPayload),
      inputs: [pgPayload],
      table: "poker_rooms",
      conflictCols: ["rid"],
   });

   // * updating latest game state to sockets in room
   await libPoker_updateRoomDataForPlayers({ roomData: { ...serverRoom, data: next_RoomData }, rid });
   // if (next_round !== "post") 
   // setTimeout(() => libPoker_resolveGameTick({ rid }), 1000);
};
type TLibPoker_resolveGameTickParams = {
   rid: string;
};

export const libPoker_startRoom = async ({ rid }: TLibPoker_startRoomParams) => {
   const { serverRoom } = await libPoker_getRoomData({ rid });
   const { status, data, players } = serverRoom;
   const { sb_index, round } = data;
   if (status !== "idle" && round !== "post") return { error: "Room is not idling" };

   // const seatSubs = players.map((player) => (player ? player.sub : null));
   const new_game_players = players;
   const seats = new_game_players.map((player, i) => (player ? i : null));
   const seatsNoNull = seats.filter((seatIndex) => seatIndex != null) as number[];
   const playerCount = new_game_players.filter(Boolean).length;

   const new_status = "playing";
   if (playerCount < 2) return { error: "Not enough players" };
   const new_sb_index = seatsNoNull.reduce(
      (prev, curr) => (curr > sb_index && (prev < sb_index || prev === sb_index) ? curr : prev),
      Math.min(...seatsNoNull)
   );
   const seatOrderIndex = seatsNoNull.findIndex((seat) => seat === new_sb_index);
   const new_play_order = [...seatsNoNull.slice(seatOrderIndex), ...seatsNoNull.slice(0, seatOrderIndex)];
   const new_play_order_index = 0;

   const new_round = "pre";
   const new_nextTimeOut = Date.now() + 10 * 1000;

   const new_deck = libPoker_generateCardDeck().shuffledDeck;
   const new_player_hands = libPoker_calculateHands({
      hands: seats.map((seat) => (seat != null ? new_deck.splice(0, 2) : null)),
   });

   const new_stake = 2;
   // [0 ,1 , 2 ,3]
   const new_round_pot: (null | number)[] = [...Array(9)].map(() => null);
   const bbSeat = new_play_order.at(-1) as number;
   new_round_pot.splice(bbSeat, 1, new_stake);
   const sbSeat = new_play_order.at(-2) as number;
   new_round_pot.splice(sbSeat, 1, new_stake / 2);

   const newData: TPokerRoomData = {
      ...data,
      game_players: new_game_players,
      sb_index: new_sb_index,
      play_order: new_play_order,
      play_order_index: new_play_order_index,
      round: new_round,
      nextTimeOut: new_nextTimeOut,
      deck: new_deck,
      player_hands: new_player_hands,
      community_cards: [],
      round_pot: new_round_pot,
      pot: [],
      stake: new_stake,
      player_action: null,
      previous_player_action: null,
      players_action: [...Array(9)].map(() => null),
      winnerSeats: [],
   };
   console.log({ newData });
   // * update data on PG for this room
   const pgPayload = {
      rid,
      status: new_status,
      data: newData,
      last_update: Date.now(),
   };
   await pgInsertOrUpdateOnConflict({
      client: "casino",
      columns: Object.keys(pgPayload),
      table: "poker_rooms",
      inputs: [pgPayload],
      conflictCols: ["rid"],
   });

   await libPoker_updateRoomDataForPlayers({ rid, roomData: { players, status: new_status, data: newData } });
};
type TLibPoker_startRoomParams = {
   rid: string;
};

export const libPoker_updateRoomDataForPlayers = async ({ roomData, rid, socketIds }: TLibPoker_updateAllPlayers) => {
   const { players, status, data } = roomData;
   // * map out all seated players sub
   const seatedSubs = players.map((seat) => (seat ? seat.sub : null)).filter(Boolean) as string[];

   // * Get all sockets in room
   const allSockets = (await io.in(rid).fetchSockets()).filter((socket) => !socketIds || socketIds.includes(socket.id));
   const viewerSockets = allSockets.filter((socket) => !seatedSubs.includes(socket.data.user.sub));
   const playerSockets = allSockets.filter((socket) => seatedSubs.includes(socket.data.user.sub));

   // * broadcast to sockets in room
   const viewerRoomData = {
      players,
      status: status,
      data: libPoker_maskRoomData(data),
   };
   viewerSockets.forEach((socket) => socket.emit("updateRoom", viewerRoomData));
   playerSockets.forEach((socket) => {
      const seatIndex = players.findIndex((seat) => seat && seat.sub === socket.data.user.sub);
      const playerRoomData = {
         players,
         status: status,
         data: libPoker_maskRoomData(data, seatIndex),
      };
      socket.emit("updateRoom", playerRoomData);
   });
};

type TLibPoker_updateAllPlayers = {
   rid: string;
   roomData: TLibPokerServerRoomData;
   socketIds?: string[];
};

export const libPoker_getRoomData = async ({ rid }: TLibPoker_getRoomData) => {
   //* getting raw pg room columns
   const rawRoom = await pgClients["casino"].one<TPokerPgRoomSchema>(
      `SELECT players,status,data,last_update,post_actions FROM poker_rooms WHERE rid=$1`,
      [rid]
   );
   const players = await libUser_getUsers({ subs: rawRoom.players.filter(Boolean) as string[] }).then(({ players }) =>
      rawRoom.players.map((sub) => players.find((player) => player?.sub === sub) || null)
   );
   const parsedRoomData = JSONtryParse<TPokerRoomData>(rawRoom?.data, {});

   const commonRoomData = { players, status: rawRoom.status, last_update: rawRoom.last_update };
   const serverRoom: TLibPokerServerRoomData = {
      ...commonRoomData,
      data: parsedRoomData,
      post_action_parsed:
         rawRoom.post_actions?.map((str) => JSONtryParse<TPokerPostActionParsed>(str)).filter(Boolean) || [],
   };
   const clientRoom: TLibPokerClientRoomData = { ...commonRoomData, data: libPoker_maskRoomData(parsedRoomData) };

   return { rawRoom, serverRoom, clientRoom };
};

export type TLibPokerServerRoomData = {
   players: (TLibUserUser | null)[];
   status: string;
   data: TPokerRoomData;
   last_update?: number;
   post_action_parsed?: TPokerPostActionParsed[];
};
export type TLibPokerClientRoomData = {
   players: (TLibUserUser | null)[];
   status: string;
   data: Partial<TPokerRoomData>;
};

export const libPoker_maskRoomData = (roomData: TPokerRoomData, seatIndex?: number): Partial<TPokerRoomData> => {
   const { deck, player_hands: player_cards = [], ...rest } = roomData;
   if (seatIndex == null) return rest;
   const next_player_cards = player_cards.map((set, i) => (i === seatIndex || set?.show ? set : null));
   return { ...rest, player_hands: next_player_cards };
};

type TLibPoker_getRoomData = {
   rid: string;
};

export const libPoker_generateCardDeck = () => {
   const deck = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"]
      .map((str) => ["s", "c", "d", "h"].map((suit) => `${str}${suit}`))
      .flat();
   const shuffle = (array: string[]) => {
      let currentIndex = array.length,
         randomIndex;

      // While there remain elements to shuffle.
      while (currentIndex != 0) {
         // Pick a remaining element.
         randomIndex = Math.floor(Math.random() * currentIndex);
         currentIndex--;

         // And swap it with the current element.
         [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
      }

      return array;
   };
   const shuffledDeck = shuffle(deck);
   return { shuffledDeck };
};
