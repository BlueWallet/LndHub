User storage schema
===================

###key - value

####with TTL:

* userid_for_{access_token} = {userid}
* access_token_for_{userid} = {access_token}
* userid_for_{refresh_token} = {userid}
* refresh_token_for_{userid} = {access_token}
* importing_{txid} = 1 `atomic lock when processing topup tx`
* invoice_paying_for_{userid} = 1 `lock for when payinvoice is in progress`



####Forever:

* user_{login}_{password_hash} = {userid}
* bitcoin_address_for_{userid} = {address}
* balance_for_{userid} = {int}
* txs_for_{userid} = [] `serialized paid lnd invoices in a list`
* imported_txids_for_{userid} = [] `list of txids processed for this user`
* metadata_for_{userid}= {serialized json}
* userinvoices_for_{userid} = []
* payment_hash_{payment_hash} = {userid}
* ispaid_{payment_hash} = 1
 
 