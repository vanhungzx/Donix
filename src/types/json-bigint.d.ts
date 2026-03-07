declare module "json-bigint" {
  type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
  interface JSONObject {
    [key: string]: JSONValue;
  }
  interface JSONArray extends Array<JSONValue> {}

  interface JSONBigInstance {
    parse<T = JSONValue>(text: string): T;
    stringify(value: JSONValue | JSONObject | JSONArray): string;
  }

  const JSONBigInt: JSONBigInstance;
  export default JSONBigInt;
}
