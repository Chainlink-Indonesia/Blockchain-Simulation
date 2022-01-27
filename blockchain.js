/*
* Blueprint atau cetakan yg isi dari Blockchain berisi atribut, tipe data
* ,salah satu nya fuction menjalankan suatu tugas secara specific
* (membuat transaksi, memvalidasi transaki, dsb)
* */
const express = require('express');
const App = new express();

const PORT = 3000;

//Universally unique identification
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { createHash } = require('crypto');
const url = require('url');

class Blockchain{
    /* sebuah function yang pertama kali dijalankan saat class Blockchain,
    * memberikan nilai awal, menjalankan suatu perintah tertentu pertama kali, dsb
    *  */
    constructor() {
        this.difficulty_target = "0000"
        this.nodes = new Set();
        this.chain = [];
        this.current_transaction = [];
        this.hash_of_current_block = "";
        this.genesis_hash = this.hash_block({"transaction" : [], "timestamp": new Date().getTime()});
        this.append_block(
            this.genesis_hash,
            this.proof_of_work(0, this.genesis_hash, [])
        )
    }

    add_node(address){
        const parse_url = url.parse(address);
        this.nodes.add(parse_url.href)
    }

    valid_chain(chain){
        let current_index = 0;

        while(current_index < chain.length){
            /*                 index-0       index-1    index-2
                Chain -> [ {block-genesis}, {block-1}, {block-2}, {block-3} ]  = length 4
            */
            let block = chain[current_index];

            const isValidProof = this.valid_proof(
                block['index'],
                block['hash_of_previous_block'],
                block['transaction'],
                block['nonce'],
            );

            if(isValidProof === false){
                return false;
            }
            //Proses
            current_index += 1;
        }

        return true;
    }

    async update_blockchain(){
        const neighbours = Array.from(this.nodes);

        let new_chain = null;
        let max_length = this.chain.length;

        for(const node of neighbours){
            let response = await axios.get(`http://${node}/blockchain`);
            if(response.status === 200){
                const length = response.data.length;
                const chain = response.data.chain;

                if(length > max_length && this.valid_chain(chain)){
                    max_length = length;
                    new_chain = chain;
                }

                if(new_chain){
                    this.chain = new_chain;
                    return true;
                }
            }
        }
        return false;
    }

    hash_block(block){
        const block_encoded = encodeURI(JSON.stringify(block))
        return createHash('sha256').update(block_encoded).digest('hex');
    }

    valid_proof(index, hash_of_previous_block, transactions, nonce){
        const content = `${index}${hash_of_previous_block}${transactions}${nonce}`;
        const contentHash = createHash('sha256').update(content).digest('hex');

        //contentHash = 0000c60f134d53695cd0a612d748c2079211dfc8684e93b9d2d92e6a59ffbb5e
        if(contentHash.substring(0, 4) === this.difficulty_target){
            this.hash_of_current_block = contentHash;
            return true;
        }

        return false;
    }

    proof_of_work(index, hash_of_previous_block, transactions){
        let nonce = 0;

        while( this.valid_proof(index, hash_of_previous_block, transactions, nonce) === false ){
            nonce += 1;
        }

        return nonce;
    }

    append_block(hash_of_previous_block, nonce){
        const block = {
            index: this.chain.length,
            timestamp: new Date().getTime(),
            transaction: this.current_transaction,
            nonce: nonce,
            hash_of_previous_block: hash_of_previous_block,
            hash_of_current_block: this.hash_of_current_block
        };

        this.current_transaction = [];
        this.hash_of_current_block = "";
        this.chain.push(block);
        return block;
    }

    add_transaction(sender, reciever, amount){
        this.current_transaction.push({
            sender: sender,
            reciever: reciever,
            amount: amount
        });

        return this.last_block().index + 1; //Calon urutan block yang akan ditempatkan
    };

    last_block(){
        /*                       index-0               index-1              index-2
        *   Blockchain -> [ {"block" : "block-1"}, {"block" : "block-2"}, {"block" : "block-3"}  ] = Length 3
        *   this.chain[ 3 - 1 ]
        *   this.chain[ 2 ]
        * */
        return this.chain[ this.chain.length - 1 ];
    }
}

//477da72779314141960602b4cc40eb86
const node_identifier = String(uuidv4()).replace(/-/g, "");
const blockchain = new Blockchain();
App.use(express.json());

App.listen(PORT, async (err) => {
    if(err){
        console.error("Error while starting server, msg : ", err);
    }
    console.log("Server started at http://localhost:",PORT);
});

App.get('/blockchain', async (req, res) => {
    const response = {
        chain: blockchain.chain,
        length: blockchain.chain.length
    };

    res.status(200)
        .send(response)
});

App.post('/transactions/new', async (req, res) => {
    const { sender, receiver, amount } = req.body;

    const index = blockchain.add_transaction(sender, receiver, amount);
    const response = {
        success: true,
        message: `Transaksi akan ditambahkan ke blok ${index}`
    };

    res.status(200)
        .send(response)
});

App.get('/mine', async(req, res) => {
    blockchain.add_transaction("0", node_identifier, 1);
    const lash_hash_block = blockchain.last_block().hash_of_current_block;
    const index = blockchain.chain.length;

    const nonce = blockchain.proof_of_work(index, lash_hash_block, blockchain.current_transaction);
    const block = blockchain.append_block(lash_hash_block, nonce);

    const response = {
        message: "Block baru telah ditambahkan (mined)",
        index: block['index'],
        hash_of_previous_block: block['hash_of_previous_block'],
        hash_of_current_block: block['hash_of_current_block'],
        nonce: block['noce'],
        transaction: block['transaction']
    };

    res.status(200)
        .send(response)
})

App.post('/nodes/add_nodes', async (req, res) => {
    const { nodes } = req.body;

    //nodes => ["localhost:3000", "localhost:3001"]
    for(const node of nodes){
        blockchain.add_node(node)
    };

    const response = {
        message: "Node baru telah ditambahkan",
        nodes: Array.from(blockchain.nodes)
    };

    res.status(200)
        .send(response);
});

App.get('/nodes/sync', async (req, res) => {
    const updated = await blockchain.update_blockchain();
    let response;

    if(updated){
        response = {
            message: 'Blockchain telah diperbarui dengan data terbaru',
            blockchain: blockchain.chain
        }
    } else {
        response = {
            message: 'Blockchain sudah menggunakan dengan data terbaru',
            blockchain: blockchain.chain
        }
    }

    res.status(200)
        .send(response)
});
