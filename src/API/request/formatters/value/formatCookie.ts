const formatCookie = (arr: string[], url: string): string =>
  `${arr[0]}=${arr[1]}; Path=${arr[3]}; Domain=${url}.com`;

export default formatCookie;
