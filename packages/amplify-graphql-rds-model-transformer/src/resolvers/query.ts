import {
  Expression,
  set,
  ref,
  obj,
  str,
  ifElse,
  compoundExpression,
  methodCall,
  qref,
  toJson,
  printBlock,
  iff,
  int,
  not,
  equals,
  bool,
  and,
  isNullOrEmpty,
  list,
  forEach,
  nul,
} from 'graphql-mapping-template';
import { ResourceConstants, setArgs } from 'graphql-transformer-common';
const authFilter = ref('ctx.stash.authFilter');

/**
 * Generate get query resolver template
 */
export const generateGetRequestTemplate = (): string => {
  const statements: Expression[] = [
    set(ref('GetRequest'), obj({ version: str('2018-05-29'), operation: str('Query') })),
    ifElse(
      ref('ctx.stash.metadata.modelObjectKey'),
      compoundExpression([
        set(ref('expression'), str('')),
        set(ref('expressionNames'), obj({})),
        set(ref('expressionValues'), obj({})),
        forEach(ref('item'), ref('ctx.stash.metadata.modelObjectKey.entrySet()'), [
          set(ref('expression'), str('$expression#keyCount$velocityCount = :valueCount$velocityCount AND ')),
          qref(methodCall(ref('expressionNames.put'), str('#keyCount$velocityCount'), ref('item.key'))),
          qref(methodCall(ref('expressionValues.put'), str(':valueCount$velocityCount'), ref('item.value'))),
        ]),
        set(ref('expression'), methodCall(ref('expression.replaceAll'), str('AND $'), str(''))),
        set(
          ref('query'),
          obj({ expression: ref('expression'), expressionNames: ref('expressionNames'), expressionValues: ref('expressionValues') }),
        ),
      ]),
      set(
        ref('query'),
        obj({
          expression: str('id = :id'),
          expressionValues: obj({
            ':id': methodCall(ref('util.parseJson'), methodCall(ref('util.dynamodb.toDynamoDBJson'), ref('ctx.args.id'))),
          }),
        }),
      ),
    ),
    qref(methodCall(ref('GetRequest.put'), str('query'), ref('query'))),
    iff(
      not(isNullOrEmpty(authFilter)),
      qref(
        methodCall(
          ref('GetRequest.put'),
          str('filter'),
          methodCall(ref('util.parseJson'), methodCall(ref('util.transform.toDynamoDBFilterExpression'), authFilter)),
        ),
      ),
    ),
    toJson(ref('GetRequest')),
  ];

  return printBlock('Get Request template')(compoundExpression(statements));
};

export const generateGetResponseTemplate = (isSyncEnabled: boolean): string => {
  const statements = new Array<Expression>();
  if (isSyncEnabled) {
    statements.push(
      iff(ref('ctx.error'), methodCall(ref('util.error'), ref('ctx.error.message'), ref('ctx.error.type'), ref('ctx.result'))),
    );
  } else {
    statements.push(iff(ref('ctx.error'), methodCall(ref('util.error'), ref('ctx.error.message'), ref('ctx.error.type'))));
  }
  statements.push(
    ifElse(
      and([not(ref('ctx.result.items.isEmpty()')), equals(ref('ctx.result.scannedCount'), int(1))]),
      toJson(ref('ctx.result.items[0]')),
      compoundExpression([
        iff(and([ref('ctx.result.items.isEmpty()'), equals(ref('ctx.result.scannedCount'), int(1))]), ref('util.unauthorized()')),
        toJson(nul()),
      ]),
    ),
  );
  return printBlock('Get Response template')(compoundExpression(statements));
};

export const generateListRequestTemplate = (modelName: string): string => {
  const statements: Expression[] = [
    set(
      ref('lambdaArgs'),
      obj({
        detail: obj({
          args: ref('context.arguments'),
          info: ref('context.info'),
          tableName: str(modelName),
          operation: str('GET'),
        }),
      }),
    ),
    obj({
      version: str('2017-02-28'),
      operation: str('Invoke'),
      payload: methodCall(ref('util.toJson'), ref('lambdaArgs')),
    }),
  ];
  return printBlock('List Request')(compoundExpression(statements));
};

export const generateSyncRequestTemplate = (): string => {
  return printBlock('Sync Request template')(
    compoundExpression([
      setArgs,
      ifElse(
        not(isNullOrEmpty(authFilter)),
        compoundExpression([
          set(ref('filter'), authFilter),
          iff(not(isNullOrEmpty(ref('args.filter'))), set(ref('filter'), obj({ and: list([ref('filter'), ref('args.filter')]) }))),
        ]),
        iff(not(isNullOrEmpty(ref('args.filter'))), set(ref('filter'), ref('args.filter'))),
      ),
      iff(
        not(isNullOrEmpty(ref('filter'))),
        compoundExpression([
          set(
            ref(`filterExpression`),
            methodCall(ref('util.parseJson'), methodCall(ref('util.transform.toDynamoDBFilterExpression'), ref('filter'))),
          ),
          iff(
            not(methodCall(ref('util.isNullOrBlank'), ref('filterExpression.expression'))),
            compoundExpression([
              iff(
                equals(methodCall(ref('filterExpression.expressionValues.size')), int(0)),
                qref(methodCall(ref('filterExpression.remove'), str('expressionValues'))),
              ),
              set(ref('filter'), ref('filterExpression')),
            ]),
          ),
        ]),
      ),
      obj({
        version: str('2018-05-29'),
        operation: str('Sync'),
        filter: ifElse(ref('filter'), ref('util.toJson($filter)'), nul()),
        limit: ref(`util.defaultIfNull($args.limit, ${ResourceConstants.DEFAULT_SYNC_QUERY_PAGE_LIMIT})`),
        lastSync: ref('util.toJson($util.defaultIfNull($args.lastSync, null))'),
        nextToken: ref('util.toJson($util.defaultIfNull($args.nextToken, null))'),
      }),
    ]),
  );
};
