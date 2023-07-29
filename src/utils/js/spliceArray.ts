/**
 * PG 30000
 * @param arr any[]
 * @param chunkSize number
 * @returns
 */
const spliceArray = (arr: any[], chunkSize: number) => {
   chunkSize = Math.floor(chunkSize);
   const res = [];
   for (let i = 0; i < arr.length; i += chunkSize) {
      const chunk = arr.slice(i, i + chunkSize);
      res.push(chunk);
   }
   return res;
};
export default spliceArray;
