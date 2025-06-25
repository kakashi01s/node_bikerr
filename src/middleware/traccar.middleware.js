import axios from "axios";
import qs from 'qs'; // Import the qs library


async function createTraccarUser(name, email, password) {
    const config = {
        headers: {
            'Content-Type': 'application/json',
        },
        auth: {
            username: process.env.TEMAIL,
            password: process.env.TPASS,
        },
        timeout: 5000,
    };

    try {
        const response = await axios.post(`${process.env.TRACCAR_URL}/users`, {name, email, password,deviceLimit: -1 }, config);
        console.log('Traccar user creation successful from utility');
        return { success: true, data: response.data };
    } catch (error) {
        console.error('Error creating Traccar user from utility:', error);
        return { success: false, error: error.message };
    }
}

async function updateTraccarPassword(id, password,name, email) {
    const config = {
        headers: {
            'Content-Type': 'application/json',
        },
        auth: {
            username: process.env.TEMAIL,
            password: process.env.TPASS,
        },
        timeout: 5000,
    };

    try {
        // Construct the endpoint URL with the provided ID as a path parameter
        const endpoint = `${process.env.TRACCAR_URL}/users/${id}`;

        // Construct the request body with the ID and the new password
        const requestBody = {
            id: id,
            password: password,
            name:name,
            email:email
        };

        // Use axios.put to update the user at the specified endpoint
        const response = await axios.put(endpoint, requestBody, config);
        console.log(`Traccar user password updated successfully for user ID: ${id} from utility`);
        return { success: true, data: response.data };
    } catch (error) {
        console.error(`Error updating Traccar password for user ID: ${id}:`, error);
        return { success: false, error: error.message };
    }
}
async function generateTraccarToken(email, password) {
    try {
        const response = await axios.post(
            `${process.env.TRACCAR_URL}/session/token`,
        
            qs.stringify({
                email,
                password
            }),
            {
                headers: {
                    'Content-Type':'application/x-www-form-urlencoded'
                },
                auth: {
                    username: process.env.TEMAIL,
                    password: process.env.TPASS
                }

                
                //                 auth: {
                //   email,
                //     password
                // }
            }
        );

        console.log("Tracar Session created successfully", response)
        return {success: true, data: response.data}

    } catch (error) {
        let errorMessage = 'Error creating Traccar session: ';
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            errorMessage += `Server responded with ${error.response.status}: ${error.response.data?.message || JSON.stringify(error.response.data)}`;
            console.error(errorMessage, error.response);
            if (error.response.status === 401) {
                return { success: false, error: 'Unauthorized: Invalid email or password.' };
            }
        } else if (error.request) {
            // The request was made but no response was received
            errorMessage += 'No response received from the server.';
            console.error(errorMessage, error.request);
        } else {
            // Something happened in setting up the request that triggered an Error
            errorMessage += error.message;
            console.error(errorMessage, error);
        }
        return { success: false, error: errorMessage };
    }
}

async function getTraccarSessionCookie(email, password) {
    try {
        const url = `${process.env.TRACCAR_URL}/session`; // Targetting /session endpoint

        // Axios handles 'auth' property for Basic Authentication directly
        // The 'Content-Type' header for form-urlencoded is also needed
        const response = await axios.post(
            url,
            // Body for application/x-www-form-urlencoded
            qs.stringify({
                email,
                password
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json' // Inform server we prefer JSON response
                },
                // Basic Authentication using Axios's 'auth' property
                auth: {
                    username: email,
                    password: password
                }
            }
        );

        console.log("Traccar /session call successful.", response.status);
        console.log("Response Headers:", response.headers);

        const setCookieHeader = response.headers['set-cookie'];

        if (setCookieHeader && setCookieHeader.length > 0) {
            // Find the JSESSIONID cookie. It's typically the first one or can be found by name.
            // Traccar usually sends it as the first part of the 'set-cookie' header.
            const jsessionidCookie = setCookieHeader[0].split(';')[0];
            console.log("Extracted JSESSIONID:", jsessionidCookie);
            return { success: true, data: jsessionidCookie };
        } else {
            console.warn("Warning: 'set-cookie' header not found in successful /session response.");
            return { success: false, error: 'No session cookie received.' };
        }

    } catch (error) {
        let errorMessage = 'Error getting Traccar session cookie: ';
        if (error.response) {
            // The request was made and the server responded with a status code
            errorMessage += `Server responded with ${error.response.status}: ${error.response.data?.message || JSON.stringify(error.response.data)}`;
            console.error(errorMessage, error.response.data || error.response.status);
            if (error.response.status === 401) {
                return { success: false, error: 'Unauthorized: Invalid email or password or session issue.' };
            }
        } else if (error.request) {
            // The request was made but no response was received
            errorMessage += 'No response received from the server (network error or server down).';
            console.error(errorMessage, error.request);
        } else {
            // Something happened in setting up the request that triggered an Error
            errorMessage += error.message;
            console.error(errorMessage, error);
        }
        return { success: false, error: errorMessage };
    }
}

export { createTraccarUser, updateTraccarPassword, generateTraccarToken , getTraccarSessionCookie};