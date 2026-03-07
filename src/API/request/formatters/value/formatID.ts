const formatID = (id?: string | null): string | undefined | null => {
  if (id !== undefined && id !== null) {
    return id.replace(/(fb)?id[:.]/, "");
  }
  return id;
};

export default formatID;