import { request } from "undici";

export default async function api_request(url: string, token: string, method: string, body?: string) {
    const api_url = `https://sandbox-api.okto.tech/${url}`;
    const OKTO_API_KEY = "ee945375-6405-4dbc-9771-884a46528d3c";
    let req_data;
    if (body) {
        req_data = {
            method: method,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                'User-Agent': 'NextJSDev/1.0',
                'Referer': 'http://localhost:3000'
            },
            body: JSON.stringify(body)
        }
    }
    else {
        req_data = {
            method: method,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                'User-Agent': 'NextJSDev/1.0',
                'Referer': 'http://localhost:3000'
            },
        }
    }
    try {
        const response = await request(api_url, req_data);
        const data = await response.body.json()
        console.log(data);
        return data;
        
    } catch (error) {
        console.error("Login API Error:", error);
        throw error;
    }
}


// format 
// {
//     url: ""
//     description: ""
//     request_body: [],
//     user_provided_all: true/false,
//     // if user_provider_all: false then ask user to give
//     missing_data:? "",
//     valid_info: true/false,
// }

// add a confirm button for all the request that have body