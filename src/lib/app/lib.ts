export const libApp_log = ({ src, enable }: TLibApp_log) => {
   const log = (a: any) => enable && console.log(src, a);
   return { log };
};
type TLibApp_log = {
   src: string | number;
   enable: boolean;
};
