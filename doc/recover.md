
recover user's wallet
=====================

* find user's id
	f0db84e6fd5dee530314fbb90cec24839f4620914e7cd0c7
* issue new credentials via tests/integration/LightningCustodianWallet.test.js
	lndhub://3d7c028419356d017199:66666666666666666666
	(this is user:password)
* lookup redis record `user_{login}_{password_hash} = {userid}` : 
	```
	> keys user_3d7c028419356d017199*
	1) "user_3d7c028419356d017199_505018e35414147406fcacdae63babbfca9b1abfcb6d091a4cca9a7611183284"
	```

* save to this record old user's id:
	`> set user_3d7c028419356d017199_505018e35414147406fcacdae63babbfca9b1abfcb6d091a4cca9a7611183284 f0db84e6fd5dee530314fbb90cec24839f4620914e7cd0c7`
 done! issued credentials should point to old user
