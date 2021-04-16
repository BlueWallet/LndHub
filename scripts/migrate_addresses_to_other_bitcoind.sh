# this script should be used if youre retiring one bitcoind in favor of new one
# it exports all addresses from the old one and prepares script to import them on a new node
#   
echo export 1...
./bitcoin-0.21.0/bin/bitcoin-cli -rpcwallet="" -rpcconnect=1.1.1.1 -rpcuser=user -rpcpassword=oldPassword listreceivedbyaddress 0 true true  > addresses.txt
echo export 2...
./bitcoin-0.21.0/bin/bitcoin-cli -rpcwallet="wallet.dat" -rpcconnect=1.1.1.1 -rpcuser=user -rpcpassword=oldPassword listreceivedbyaddress 0 true true  >> addresses.txt
  
echo clean...
cat  addresses.txt  | grep address  |  sort -u  | awk '{print $2}' | sed 's/"//g' | sed 's/,//g' > addresses_clean.txt

echo "got addresses:"
wc -l < addresses_clean.txt


echo writing import_on_other_node.sh ...
>import_on_other_node.sh
chmod +x import_on_other_node.sh

while read in; do
        echo "./bitcoin-0.21.0/bin/bitcoin-cli -rpcconnect=2.2.2.2 -rpcuser=user -rpcpassword=newPassword importaddress $in $in false" >> import_on_other_node.sh
done < addresses_clean.txt

echo 'done. dont forget to run ./import_on_other_node.sh and then ./bitcoin-0.21.0/bin/bitcoin-cli -rpcconnect=2.2.2.2 -rpcwallet="wallet.dat" -rpcuser=user -rpcpassword=newPassword rescanblockchain  459491'

