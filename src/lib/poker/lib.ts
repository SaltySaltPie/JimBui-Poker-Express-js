// @ts-ignore
import { Hand } from "pokersolver";
import { RemoteSocket } from "socket.io";
import { io } from "../../app";
import { pgClients } from "../../config/postgres";
import { TUnknownObj, TUserCache } from "../../types/common";
import {
   TPg_PokerRoomSchema,
   TPokerPlayerHand,
   TPokerPostActionParsed,
   TPokerRoomConfigParsed,
   TPokerRoomDataParsed,
   TPokerRound,
   TPokerScoreboardLine,
} from "../../types/poker/types";
import JSONtryParse from "../../utils/js/JSONtryParse";
import { TLibUserUser, libUser_getUsers } from "../user/lib";
import pgInsertOrUpdateOnConflict from "../../utils/postgres/pgInsertOrUpdateOnConflict";
import { TPokerSolverSolved } from "../../types/pokersolver";
import { jsArrayFindNextNonNull } from "../../utils/js/jsArrayFindNextNonNull";
import { libApp_log } from "../app/lib";

export const libPoker_calculateHand = ({
   cards,
   community_cards = [],
}: TLibPoker_calculateHandParams): TPokerPlayerHand => {
   const hand: TPokerSolverSolved = Hand.solve([...community_cards, ...cards]);
   return {
      cards,
      combo: hand.cards.map(({ suit, value }) => value + suit),
      desc: hand.descr,
      name: hand.name,
      rank: hand.rank,
   };
};
type TLibPoker_calculateHandParams = {
   cards: string[];
   community_cards?: string[];
};

export const libPoker_startRoom = async ({ rid, config }: TLibPoker_startRoomParams) => {
   const { serverRoom } = await libPoker_getRoomData({ rid });
   const { status, data, players } = serverRoom;
   const { sb_index, round } = data;
   const finalConfig: TPokerRoomConfigParsed = { timeoutMs: 10000, ...config };
   if (status !== "idle" && round !== "post") return { error: "Room is not idling" };

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
   const new_nextTimeOut = Date.now() + finalConfig.timeoutMs;

   const new_deck = libPoker_generateCardDeck().shuffledDeck;
   // const new_deck = ["Js", "7s", "Jd", "7d", "Kh", "5c", "8d", "Qh", "6c"];

   const new_player_hands = seats.map((seat) =>
      seat != null ? libPoker_calculateHand({ cards: new_deck.splice(0, 2) }) : null
   );

   const new_stake = 2;
   // [0 ,1 , 2 ,3]
   const new_round_pot: (null | number)[] = [...Array(9)].map(() => null);
   const bbSeat = new_play_order.at(-1) as number;
   new_round_pot.splice(bbSeat, 1, new_stake);
   const sbSeat = new_play_order.at(-2) as number;
   new_round_pot.splice(sbSeat, 1, new_stake / 2);

   const newData: TPokerRoomDataParsed = {
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
      config: finalConfig,
      post_actions: [],
   };
   await pgInsertOrUpdateOnConflict({
      db: "casino",
      columns: Object.keys(pgPayload),
      table: "poker_rooms",
      inputs: [pgPayload],
      conflictCols: ["rid"],
   });

   await libPoker_updateRoomDataForPlayers({ rid, roomData: { ...serverRoom, status: new_status, data: newData } });
   setTimeout(() => libPoker_resolveGameTick({ rid, pollId: Date.now() }), 1000);
};
type TLibPoker_startRoomParams = { rid: string; config?: Partial<TPokerRoomConfigParsed> };

export const libPoker_resolveGameTick = async ({ rid, pollId }: TLibPoker_resolveGameTickParams): Promise<any> => {
   const { log } = libApp_log({ enable: true, src: pollId });
   const { clientRoom, rawRoom, serverRoom } = await libPoker_getRoomData({ rid });
   const { data, post_actions_parsed = [], config, players = [] } = serverRoom;
   const { timeoutMs = 10000 } = config;
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

   const seatIndex = play_order[play_order_index];
   const seatRoundPot = round_pot[seatIndex];

   let next_players = players;

   let next_pot = pot;
   let next_round_pot = round_pot;
   let next_stake = stake;
   let next_play_order = play_order;
   let next_play_order_index = play_order_index;
   let next_nextTimeOut = Date.now() + timeoutMs;
   let next_round: TPokerRound = round;
   let next_deck = deck;
   let next_community_cards = community_cards;
   let next_player_hands = player_hands;
   let next_scoreboard = scoreboard;
   let next_players_action = players_action;
   let next_winnerSeats: number[] = [];
   let next_player_action = player_action;

   const handleWinners = () => {
      console.log("Handling Winners!");

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
      if (next_play_order.length === 1) next_winnerSeats.push(next_play_order[0]);
      else
         next_play_order.forEach((seatIndex) => {
            const hand = next_player_hands[seatIndex]?.cards || [];
            if (hand.some((card) => winningCards.includes(card))) next_winnerSeats.push(seatIndex);
         });

      if (next_play_order.length > 1)
         next_player_hands = next_player_hands.map((hand, i) =>
            next_winnerSeats.includes(i) && hand ? { ...hand, show: true, winner: true } : hand
         );
      const totalPot = next_pot.reduce((prev, curr) => (prev || 0) + (curr || 0), 0) as number;

      console.log({ next_winnerSeats, totalPot });
      next_winnerSeats.forEach((seatIndex) => {
         const player = game_players[seatIndex] as TLibUserUser;
         const scoreboardLineIndex = scoreboard.findIndex((scEntry) => scEntry.sub === player.sub);
         const scoreboardLine: TPokerScoreboardLine =
            scoreboardLineIndex > -1
               ? scoreboard[scoreboardLineIndex]
               : { sub: player.sub, name: player.name || player.sub, alpha: 0 };
         const new_scoreboardLine = {
            ...scoreboardLine,
            alpha: scoreboardLine.alpha + totalPot / next_winnerSeats.length,
         };
         console.log({ new_scoreboardLine });
         if (scoreboardLineIndex > -1) next_scoreboard.splice(scoreboardLineIndex, 1, new_scoreboardLine);
         else next_scoreboard.push(new_scoreboardLine);
      });
   };
   const handleStopGame = async () => {
      const pgPayload: Partial<TPg_PokerRoomSchema> = { rid, status: "idle" };
      log("Stopping game");
      await pgInsertOrUpdateOnConflict({
         inputs: [pgPayload],
         db: "casino",
         columns: Object.keys(pgPayload),
         table: "poker_rooms",
         conflictCols: ["rid"],
      });
      await libPoker_updateRoomDataForPlayers({ rid, roomData: { ...serverRoom, status: "idle" } });
   };

   if (next_players.filter((seat) => seat != null).length < 2) {
      // * stopping game due to not enough players
      await handleStopGame();
      return;
   }

   if (round === "post") {
      if (!isTimedOut) {
         if (post_actions_parsed.length > 0) {
            // * handling post game requests
            post_actions_parsed.forEach((action) => {
               if (action.type === "standup" && action.seat) next_players.splice(action.seat, 1, null);
               if (action.type === "rabbit" && next_community_cards.length < 5) {
                  next_community_cards.push(...next_deck.splice(0, 5 - next_community_cards.length));
                  next_player_hands = next_player_hands.map((hand) =>
                     hand
                        ? {
                             ...libPoker_calculateHand({ cards: hand.cards, community_cards: next_community_cards }),
                             show: hand.show,
                          }
                        : null
                  );
               }
               if (action.type === "show")
                  next_player_hands = next_player_hands.map((hand, i) =>
                     hand && i === action.seat ? { ...hand, show: true } : hand
                  );
            });
            // * removing processed post game requests
            await pgClients["casino"].none(
               `UPDATE poker_rooms SET post_actions=(SELECT post_actions[${
                  post_actions_parsed.length + 1
               }:] FROM poker_rooms WHERE rid=$1) WHERE rid=$1`,
               [rid]
            );
            const newData = {
               ...data,
               community_cards: next_community_cards,
               deck: next_deck,
               player_hands: next_player_hands,
            };
            const pgPayload: { rid: string; data: TPokerRoomDataParsed; players: (string | null)[] } = {
               rid,
               players: [...Array(9)].map((_, i) => next_players[i]?.sub || null),
               data: newData,
            };
            await pgInsertOrUpdateOnConflict({
               inputs: [pgPayload],
               db: "casino",
               columns: Object.keys(pgPayload),
               table: "poker_rooms",
               conflictCols: ["rid"],
            });
            await libPoker_updateRoomDataForPlayers({
               rid,
               roomData: { ...serverRoom, data: newData, players: next_players },
            });
            log("Resolved all post game demands");
         }
         setTimeout(() => libPoker_resolveGameTick({ rid, pollId }), 1000);
         log("Post game waiting to time out");
         return;
      }

      // * restarting game
      if (next_players.filter((seat) => seat != null).length > 1) {
         log("Retarting room");
         libPoker_startRoom({ rid });
      } else await handleStopGame();
      return;
   }

   // * timeout logics
   if (!isTimedOut && !next_player_action) {
      log("Player has not actioned, polling");
      setTimeout(() => libPoker_resolveGameTick({ rid, pollId }), 1000);
      return;
   }
   if (isTimedOut) {
      if (next_stake === seatRoundPot) next_player_action = "check";
      else {
         next_player_action = "fold";
         // * queue up standup/kick player due to timeout
         await pgClients["casino"].none(`UPDATE poker_rooms SET post_actions = post_actions || $1 WHERE rid=$2`, [
            [{ type: "standup", seat: seatIndex } satisfies TPokerPostActionParsed],
            rid,
         ]);
      }
   }

   if (next_player_action === "call") {
      next_round_pot.splice(seatIndex, 1, stake);
      next_players_action.splice(seatIndex, 1, "call");
   }
   if (next_player_action === "check") {
      next_play_order_index === play_order_index + 1;
      next_players_action.splice(seatIndex, 1, "check");
   }
   if (next_player_action === "fold") {
      next_play_order = next_play_order.filter((seatNum) => seatNum !== seatIndex);
      next_players_action.splice(seatIndex, 1, "fold");
   }
   if (next_player_action === "raise") {
      next_stake = stake + (player_action_amount || 0);
      next_round_pot.splice(seatIndex, 1, next_stake);

      next_play_order = [...play_order.slice(play_order_index), ...play_order.slice(0, play_order_index)];
      next_players_action = [...Array(9)].map((_, i) => (i === seatIndex ? "raise" : null));
      next_play_order_index = 1;
   }

   if (next_play_order.length === 1) {
      next_round = "post";
      next_pot = next_round_pot.map((seatPot, i) => (seatPot != null ? seatPot + (next_pot[i] || 0) : next_pot[i]));
      console.log({ next_pot_before: next_pot });
      handleWinners();
   }

   const isLastPlayerOrder = play_order_index === play_order.length - 1;
   if (isLastPlayerOrder && next_player_action !== "raise" && next_play_order.length > 1) {
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
      next_player_hands = next_player_hands.map((hand) =>
         hand ? libPoker_calculateHand({ cards: hand.cards, community_cards: next_community_cards }) : null
      );

      next_round_pot = [...Array(9)].map(() => 0);

      if (next_round === "post") {
         next_play_order_index = -1;
         next_players_action = [...Array(9)].map(() => null);
         //* get player ranking
         handleWinners();
      }
   } else if (next_player_action !== "raise") {
      next_play_order_index = play_order_index + 1;
   }

   const next_RoomData: TPokerRoomDataParsed = {
      ...data,
      pot: next_pot,
      round_pot: next_round_pot,
      stake: next_stake,
      play_order: next_play_order,
      play_order_index: next_play_order_index,
      player_action: null,
      previous_player_action: next_player_action,
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
   const pgPayload: { rid: string; data: TPokerRoomDataParsed; previous_data: TPokerRoomDataParsed } = {
      rid,
      data: next_RoomData,
      previous_data: data,
   };

   await pgInsertOrUpdateOnConflict({
      db: "casino",
      columns: Object.keys(pgPayload),
      inputs: [pgPayload],
      table: "poker_rooms",
      conflictCols: ["rid"],
   });

   // * updating latest game state to sockets in room
   await libPoker_updateRoomDataForPlayers({ roomData: { ...serverRoom, data: next_RoomData }, rid });
   // if (next_round !== "post")
   log("End of Logic");
   setTimeout(() => libPoker_resolveGameTick({ rid, pollId }), 1000);
   return;
};
type TLibPoker_resolveGameTickParams = { rid: string; pollId: number };

export const libPoker_updateRoomDataForPlayers = async ({ roomData, rid, socketIds }: TLibPoker_updateAllPlayers) => {
   const { players, status, data, config } = roomData;
   // * map out all seated players sub
   const seatedSubs = players.map((seat) => (seat ? seat.sub : null)).filter(Boolean) as string[];

   // * Get all sockets in room
   const allSockets = (await io.in(rid).fetchSockets()).filter((socket) => !socketIds || socketIds.includes(socket.id));
   const viewerSockets = allSockets.filter((socket) => !seatedSubs.includes(socket.data.user.sub));
   const playerSockets = allSockets.filter((socket) => seatedSubs.includes(socket.data.user.sub));

   // * broadcast to sockets in room
   const viewerRoomData = { players, status: status, config, data: libPoker_maskRoomData(data) };
   viewerSockets.forEach((socket) => socket.emit("updateRoom", viewerRoomData));
   playerSockets.forEach((socket) => {
      const seatIndex = players.findIndex((seat) => seat && seat.sub === socket.data.user.sub);
      const playerRoomData = { ...viewerRoomData, data: libPoker_maskRoomData(data, seatIndex) };
      socket.emit("updateRoom", playerRoomData);
   });
};

type TLibPoker_updateAllPlayers = { rid: string; roomData: TLibPokerServerRoomData; socketIds?: string[] };

export const libPoker_getRoomData = async ({ rid }: TLibPoker_getRoomData) => {
   //* getting raw pg room columns
   const rawRoom = await pgClients["casino"].one<
      Pick<TPg_PokerRoomSchema, "players" | "status" | "data" | "last_update" | "post_actions" | "config">
   >(`SELECT players,status,data,last_update,post_actions,config FROM poker_rooms WHERE rid=$1`, [rid]);
   const players = await libUser_getUsers({ subs: rawRoom.players.filter(Boolean) as string[] }).then(({ players }) =>
      rawRoom.players.map((sub) => players.find((player) => player?.sub === sub) || null)
   );
   const parsedRoomData = JSONtryParse<TPokerRoomDataParsed>(rawRoom.data, {});
   const parsedConfigData = JSONtryParse<TPokerRoomConfigParsed>(rawRoom.config, {});
   const commonRoomData = {
      players,
      status: rawRoom.status,
      last_update: rawRoom.last_update,
      config: parsedConfigData,
   };
   const serverRoom: TLibPokerServerRoomData = {
      ...commonRoomData,
      data: parsedRoomData,
      post_actions_parsed:
         rawRoom.post_actions?.map((str) => JSONtryParse<TPokerPostActionParsed>(str)).filter(Boolean) || [],
   };
   const clientRoom: TLibPokerClientRoomData = { ...commonRoomData, data: libPoker_maskRoomData(parsedRoomData) };
   return { rawRoom, serverRoom, clientRoom };
};
type TLibPoker_getRoomData = { rid: string };
export type TLibPokerServerRoomData = {
   players: (TLibUserUser | null)[];
   status: string;
   data: TPokerRoomDataParsed;
   last_update?: number;
   config: TPokerRoomConfigParsed;
   post_actions_parsed?: TPokerPostActionParsed[];
};
export type TLibPokerClientRoomData = {
   players: (TLibUserUser | null)[];
   status: string;
   config: TPokerRoomConfigParsed;
   data: Partial<TPokerRoomDataParsed>;
};

export const libPoker_maskRoomData = (
   roomData: TPokerRoomDataParsed,
   seatIndex?: number
): Partial<TPokerRoomDataParsed> => {
   const { deck, player_hands: player_cards = [], ...rest } = roomData;
   if (seatIndex == null) return rest;
   const next_player_cards = player_cards.map((set, i) => (i === seatIndex || set?.show ? set : null));
   return { ...rest, player_hands: next_player_cards };
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
