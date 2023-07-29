const JSONtryParse = <T>(str: string = "", fallback?: any | undefined): T => {
   try {
      const result = JSON.parse(str);
      return result;
   } catch (error) {
      return fallback;
   }
};

export default JSONtryParse;
