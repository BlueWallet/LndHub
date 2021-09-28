# User story
- *As a user, I want to have ability to topup my balance with Bitcoin and send payments within Lightning network.*
- *As a product owner, I want to have transparent usage statistics and run-time information on payment channels and environment.*

# Basics

1. LndHub API is standalone software and needs LND client synchronized and running. LndHub API is not a Lightning wallet 
in terms of funds storage, it operates whole amount of available funds on channels. User's balances and transactions 
stored in internal database.

2. LndHub API is accessible for everyone, but only `/create` can be called without authorization token. 

3. To start sending lightning payments user should top-up his Bitcoin balance, by sending Bitcoins to address 
assigned to corresponding user id. User should wait for 3 confirmations after which funds will be available 
for Lightning payments.

4. gRPC RPC framework is used for communication with LND. See https://github.com/lightningnetwork/lnd/tree/master/lnrpc

5. Outh2 library, MongoDB and Golang backend is used for API implementation. Every request from user is signed and
associated with corresponding user id.

6. Double entry system is used for internal accounting https://en.wikipedia.org/wiki/Double-entry_bookkeeping_system
6.1. Internal accounting requirements https://github.com/matveyco/lnd-wallet-api-spec/edit/master/Accounting-requirements.md

7. All amounts are satoshis (int), although millisatoshis are used in LND internally (rounding is up to server implementation).

8. Every account has its separate Lightning, BTC addresses and unique session. If user runs few accounts from one device or wallet, corresponding amount of sessions should be opened.

9. All json keys should be in snake_case

# LndHub API Calls

| Call          | Method        |       Handler |        Params |   Return      |   Description |
| ------------- | ------------- | ------------- | ------------- | ------------- | ------------- |
| Create Account | POST  | /create | {none} | JSON Auth Data | Create new user account and get credentials |
| Authorize | POST | /auth  | auth params (login/password or refresh_token) | JSON token data | Authorize user with Oauth. When user use refresh_token to auth, then this refresh_token not available for access once again. Use new refresh_token |
| Get token | POST | /oauth2/token  | user id, secret, grant_type and scope | token data | Get token data from user id, secret, grant_type and scope |
| Get BTC Addr | GET | /getbtc  | {none} | Text address | Get user's BTC address to top-up his account |
| New BTC Addr | POST | /newbtc  | {none} | Text address | Create new BTC address for user. Old addresses should remain valid, so if user accidentaly sends money to old address transaction will be assigned to his account |
| Get Pending Balance | GET | /getpending  | {none} | JSON | Get information about BTC pending transactions which have less than 3 confirmations |
| Decode Invoice | GET | /decodeinvoice  | Invoice string | JSON | Decode invoice from invoice string. If invoice is represented as QR-code, fronted device should decode it first |
| Check Route | GET | /checkroute  | Payment destination | Success | Check if payment destination is available and invoice could be paid |
| Pay invoice | POST | /payinvoice  | Invoice string | Success | Pay invoice. Before payment invoice should be read and destination checked, also balance sum should be enough |
| Send coins | POST | /sendcoins  | Payment destination | Success | Just send coins to a specified location (Lightning address) |
| Get transactions | GET | /gettxs  | Offset, limit | JSON array | Get transactions for a wallet. With load offset at limit |
| Get transaction | GET | /gettx  | Tx id | JSON | Get tx info by its ID |
| Get balance| GET | /balance | {none} | int64 | Available unspent internal balance (in Satoshis)
| Get info | GET | /getinfo | {none} | JSON | Tech info. Fee on transactions for current user (0 for a start), available actual funds on channel, maximum tx size, service status etc.
| Get info | POST | /addinvoice | JSON | JSON | Create invoice.
| Get info | GET | /getuserinvoices | {none} | JSON | List of invoices created by user.

# API Calls detailed

## Overview

GET requests pass data as GET params (`GET /hello?foo=bar&aaa=bbb`).
POST requests pass data as `contentType: "application/json; charset=utf-8"`.
Response is always JSON.

### General success response

`ok:true` should be always present.

    {
        "ok": true // boolean
    }

### General error response

`error:true` should be always present.

    {
        "error" : true, // boolean
        "code" : 1, // int
        "message": "..." // string
    }
    
 Error code    | Error message        
 ------------- | -------------------- 
 1             | Bad auth             
 2             | Not enough balance    
 3             | Bad partner
 4             | Not a valid invoice
 5             | Lnd route not found
 6             | General server error
 7             | LND failure


## POST  /create

Create new user account and get credentials. Not whitelisted partners should return error.

при создании аккаунта можно добавить accouttype `"accounttype": "test"`

Request:

    {
        "partnerid" : "bluewallet" // string, not mandatory parameter
	"accounttype" : "..." // string, not mandatory, default is common, also can be test or core
    }
    
Response:
    
    {
        "login":"...", // srting
        "password":"...", // srting
    } 

## POST /auth?type=auth  

Authorize user with Oauth user and login

Request:

    {
	    "login": "...",   //string
	    "password": "..." //string
    }
    
Response:
    
    {
        "access_token": "...",             //string
        "token_type": "...",               //string
        "refresh_token": "...",            //string
        "expiry": "0001-01-01T00:00:00Z"   // datetime
    }
    

    
## POST /auth?type=refresh_token  

Authorize user with Oauth user and login

Request:

    {
	    "refresh_token": "...",   //string
    }
    
Response:
    
    {
        "access_token": "...",             //string
        "token_type": "...",               //string
        "refresh_token": "...",            //string
        "expiry": "0001-01-01T00:00:00Z"   // datetime
    } 

## POST /oauth2/token 

Authorize user with Oauth user and login

Request:

    {
	    "grant_type": "client_credentials",   //string
	    "client_id": "...",                   //string
	    "client_secret": "..."                // string
    }
    
Response:
    
    {
        "access_token": "...",             //string
        "token_type": "...",               //string
        "refresh_token": "...",            //string
        "expiry": "0001-01-01T00:00:00Z"   // datetime
    }

## GET /getbtc

Get user's BTC address to top-up his account

Request:

    none
    
Response:
[
    {
        address: "..." // string
    },
]

## POST /newbtc

Create new BTC address for user. Old addresses should remain valid, so if user accidentaly sends 
money to old address transaction will be assigned to his account

Request:

    none
    
Response:
    
    {
        address: "..." // string
    }

## GET /getpending 

Get information about BTC pending transactions which have less than 3 confirmations or lnd not settled invoice payments

Request:

    none
    
Response:
    
    {
        [ // array of Transaction object (see below)
            {
                ...
            }
        ]
    }

## GET /decodeinvoice 

Decode invoice from invoice string. If invoice is represented as QR-code, fronted device should decode it first

Request:

    {
        "invoice" : "..." // string with bolt11 invoice
    }
    
Response:
    
    {
        "destination": "...",         //string, lnd node address
    	"payment_hash": "...",        //string
    	"num_satoshis": "78497",      //string, satoshis
    	"timestamp": "1534430501",    //string, unixtime
    	"expiry": "3600",             //string, seconds
    	"description": "...",         //string
    	"description_hash": "",       //string
    	"fallback_addr": "...",       //string, fallback on-chain address
    	"cltv_expiry": "...",         //string, delta to use for the time-lock of the CLTV extended to the final hop
    	"route_hints": [
		{
			"hop_hints" : [
				{
					"node_id": "..",       //string, the public key of the node at the start of the
							       // channel.
							       
					"chan_id": ...,        //int, the unique identifier of the channel.
			
					"fee_base_msat": ...,  //int, The base fee of the channel denominated in
							       // millisatoshis.
			
					"fee_proportional_millionths": ...,    
					                       //int, the fee rate of the channel 
			  				       // for sending one satoshi across it denominated 
							       // in millionths of a satoshi
			
					"cltv_expiry_delta": ...   
					                       //int, the fee rate of the channel for sending one satoshi
							       // across it denominated in millionths of a satoshi
				}, ...
			]
		}, ...
	]             
    }

## GET /checkrouteinvoice 

Check if payment destination is available and invoice could be paid

Request:

    {
        "invoice" : "..." // string with bolt11 invoice
    }
    
Response:
    
    {
        "ok" : true // boolean
    }

## GET /checkroute 

Check if payment destination is available and invoice could be paid

Request:

    {
        "destination" : "..." // string, destination lnd node address
	"amt": "..."          // string, 
    }
    
Response:
    
    {
        "ok" : true // boolean
    }


## POST /payinvoice  
 
Pay invoice. Before payment invoice should be read and destination checked, also balance sum should be enough

Request:

    {
        "invoice" : "..." // string with bolt11 invoice
    }
    
Response:
    
    {
    	"payment_error": "..."                         //string
	"payment_preimage": "..."                      //string
	"payment_route": {
			"total_time_lock": ... ,       //int
			"total_fees": ... ,            //int
			"total_amt": ... ,             //int
			"total_fees_msat": ... ,       //int
			"total_amt_msat": ... ,        //int
			"hops": [
				{
					"chan_id": ... ,             //int
					"chan_capacity": ... ,       //int
					"amt_to_forward": ... ,      //int
					"fee": ... ,                 //int
					"expiry": ... ,              //int
					"amt_to_forward_msat": ... , //int
					"fee_msat": ... ,            //int
				},
			]
	}
    }

## POST /sendcoins 

Just send coins to a specified location (Lightning address)

Request:

    {
        "invoice" : "..." // string with bolt11 invoice
    }
    
Response:
    
    {
    	...          // Transaction object (see below)
    }
    
##  GET /gettxs

Get successful lightning and btc transactions user made. Order newest to oldest.

Request:

    {
        "limit" : 10, // INT
        "offset": 0, // INT
    }
    
Response:
    
    {
        [ // array of Transaction object (see below)
            {
                ...
            }
        ]
    }

##  GET /gettx

Get info on successful lightning transaction user made. TXID is an internal LndHub identifier,
no relation to onchain bitcoin txid.

Request:

    {
        "txid" : 666 // INT
    }
    
Response:
    {
    	...          // Transaction object (see below)
    }

   
## GET /getbalance

Returns balance user can spend on lightning payments.

Request:
    
    none
    
Response:

    {
    	"BTC": {                              //string, currency
        	"TotalBalance": 109388,       //int, satoshis
        	"AvailableBalance": 109388,   // int, satoshis
        	"UncomfirmedBalance": 0       //int, satoshis
	}, ... 
		//now available only btc balance
    
    }

## GET /getinfo

Returns fees user pays for payments, status of the system, etc.

Request:
    
    none
    
Response:

    {
       
        "fee": 0, // int, in cents of percent, i.e. 100 for 1%, 50 for 0.5%, 1 for 0.01%
       
       
        "identity_pubkey": "...",              //string, lnd node identity pubkey
        "alias": "...",                        //string, lnd node alias
        "num_pending_channels": 0,             //int
        "num_active_channels": 3,              //int
        "num_peers": 6,                        //int
        "block_height": 542389,                //int
        "block_hash": "...",                   //string
        "synced_to_chain": true,               //bool
        "testnet": false, 
        "chains": [
            "bitcoin"              //string, available chans to operate by lnd
        ],
        "uris": [
            "...",	                       //string, uris of lnd node
        ],
        "best_header_timestamp": "...",        //string, unixtime
        "version": "..."                       // string, lnd version
    }
    
## GET /getaddinvoice

Returns fees user pays for payments, status of the system, etc.

Request:
    
    {
        "amt": "...",            //string
        "memo":"...",            //string
        "receipt":"...",         //string, not mandatory parameter
        "preimage": "...",       //string, not mandatory parameter
        "fallbackAddr": "...",   //string, not mandatory parameter
        "expiry": "...",         //string, not mandatory parameter
        "private": "..."         //string, not mandatory parameter
    }
    
Response:

    {
        "r_hash": "...",     //string,
        "pay_req": "...",    //string, a bare-bones invoice for a payment within the Lightning Network
        "add_index": ...     //int, The “add” index of this invoice. Each newly created invoice will 
	                     // increment this index making it monotonically increasing. 
			     // Callers to the SubscribeInvoices call can use this to instantly 
			     // get notified of all added invoices with an add_index greater than this one.
    }

## GET /getuserinvoices

Returns fees user pays for payments, status of the system, etc.

Request:
    
    none
    
Response:

    {
        "r_hash": "...",            //string
        "payment_request": "...",   //string
        "add_index": "...",         //string
        "description": "...",       //string
        "amt": ... ,                //int
        "ispaid": ...               //bool
    }

# Data structures

## Transaction object
    
    {
        "type": "...", // string, type of txs. Types:
                       // bitcoind_internal_tx   - moves to user btc address or account
                       // bitcoind_tx   - received by address or account
                       // paid_invoice  - user paid someone's invoice
                       // sent_coins - user sent coins by lnd to someone's btc account
                       // received_invoice_payments - user received payments by invoice
        "txid": "...", // string, internal tx id. not related to onchain transaction id
        "amt": 666, // satoshi, int
        "fee": 11, // satoshi, int
        "timestamp": 1234567, // int, unixtime
        "from": "...", // string 
        "to": "...", // string
        "description": "...", // string, user-defined text
        "invoice": "...", // string, original bolt11-format invoice
    }

# Explaining oauth2 mechanism
## Oauth2 processes
Oauth2 process consists of such stages as:
- Client (someone, who use api), make request to Authorization service with credentials (POST /auth?type=auth)
- Authorization service checks credentials and searches for appropriate user id and secret (stored on Authorization service and Token service) and sends user id and secret to Token service (for example POST /getinfo/oauth2/token)
- Token service checks user id and secret and sends token data with refresh token to Authorization service which sends it to Client
- Client uses token to access protected resources (GET ?access_token=XXXXXXXXXXXXXX)
- When token expires or needs to refresh token for security issues Client sends refresh_token to Token service (POST /auth?type=refresh_token), which sends new token data with refresh_token and disables to access old
