export const types = {
    TxInfo: {
        tx_id: 'Vec<u8>',
        chain: 'Vec<u8>',
        height: 'Vec<u8>',
        is_success: 'bool',
        is_recharge: 'bool',
        from: 'Vec<u8>',
        maddr: 'Vec<u8>',
        to: 'Vec<u8>',
        balance: 'u128',
        token: 'Vec<u8>',
        index: 'u64',
        remark: 'Vec<u8>',
    },
    TAssetBalance: 'u128',
    AssetWithdrawal: {
        /// The balance.
        assetId: 'u32',
        index: 'u64',
        balance: 'u128',
        to: 'Vec<u8>',
        from: 'AccountId',
        tx_id: 'Vec<u8>',
        submit: 'Vec<u8>',
    },
    AssetCrossChain: {
        chain: 'Vec<u8>',
        contract: 'Vec<u8>',
        coin: 'Vec<u8>',
        is_mapping: 'bool',
    },
}
