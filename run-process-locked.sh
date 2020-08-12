while [ 1 ] ; 
do 
	date
	./node_modules/.bin/babel-node scripts/process-locked-payments.js 2>/dev/null  
	sleep 3600
done

