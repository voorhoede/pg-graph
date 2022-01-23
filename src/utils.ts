
export function exhaustiveCheck(param: never): never {
    throw new Error('should not reach here')
}


export function jsTypeToPgType(value: any) {
    switch (typeof value) {
        case 'string':
            return 'text'
        case 'number':
            return 'int'
    }
}