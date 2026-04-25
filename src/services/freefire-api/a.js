const FreeFireAPI = require('./index.js');

async function main() {
    const api = new FreeFireAPI();
    await api.login({
        skipGarenaAuth: true,
        majorLoginBearerToken: "eyJhbGciOiJIUzI1NiIsInN2ciI6IjEiLCJ0eXAiOiJKV1QifQ.eyJhY2NvdW50X2lkIjoxMDM3NTk4Nzc0OSwibmlja25hbWUiOiIwTkc0OFpQeDE2bisydVRFaGRDODA0WHA4TmF0eDRXQ293PT0iLCJub3RpX3JlZ2lvbiI6IlZOIiwibG9ja19yZWdpb24iOiJWTiIsImV4dGVybmFsX2lkIjoiNWQ5ODA2ZTlmZDMyN2E3NzA3ZjM1NWYyMDRlNGUyZGYiLCJleHRlcm5hbF90eXBlIjo4LCJwbGF0X2lkIjoxLCJjbGllbnRfdmVyc2lvbiI6IjIuMTIzLjQiLCJlbXVsYXRvcl9zY29yZSI6MTAwLCJpc19lbXVsYXRvciI6dHJ1ZSwiY291bnRyeV9jb2RlIjoiVk4iLCJleHRlcm5hbF91aWQiOjE1MjMwMDEyMzM2ODMsInJlZ19hdmF0YXIiOjEwMjAwMDAwNywic291cmNlIjowLCJsb2NrX3JlZ2lvbl90aW1lIjoxNzMzNTU5MDAxLCJjbGllbnRfdHlwZSI6Miwic2lnbmF0dXJlX21kNSI6IjFhYzRiODBlY2YwNDc4YTQ0MjAzYmY4ZmFjNjEyMGY1IiwidXNpbmdfdmVyc2lvbiI6MiwicmVsZWFzZV9jaGFubmVsIjoiYW5kcm9pZF9tYXgiLCJyZWxlYXNlX3ZlcnNpb24iOiJPQjUzIiwiZXhwIjoxNzc1NzY4NTkwfQ.npKLihQAGbs9SMysPGKtMrMvzAqPb9dZNu5c1LlpV3s",
        majorLoginPayloadPath: "C:/Users/mdong/AppData/Roaming/Reqable/tmp/0b3310db-97be-409a-a197-ecf77ef34390"
    });
    const full = await api.getPlayerProfile("4102734233");
    console.log(JSON.stringify(full, null, 2));
}

main();