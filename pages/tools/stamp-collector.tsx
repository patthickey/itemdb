import {
  Heading,
  Text,
  Center,
  Box,
  Flex,
  GridItem,
  Progress,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionIcon,
  AccordionPanel,
  SimpleGrid,
} from '@chakra-ui/react';
import Layout from '../../components/Layout';
import { createTranslator, useFormatter, useTranslations } from 'next-intl';
import { ReactElement, useEffect, useMemo } from 'react';
import Image from '../../components/Utils/Image';
import { loadTranslation } from '@utils/load-translation';
import FeedbackButton from '@components/Feedback/FeedbackButton';
import axios from 'axios';
import { ItemData, ObligatoryUserList, UserList } from '@types';

import { getUserLists } from '../api/v1/lists/[username]';
import { GetServerSidePropsContext } from 'next';
import { getListItems } from '../api/v1/lists/[username]/[list_id]/itemdata';
import ItemCard from '@components/Items/ItemCard';
import NextImage from 'next/image';
import NPBag from '../../public/icons/npbag.png';
import { preloadListItems } from '../api/v1/lists/[username]/[list_id]/items';
import useSWRImmutable from 'swr/immutable';

const ALBUM_MAX = 25;

const fetcher = (url: string) => axios.get(url).then((res) => res.data as ObligatoryUserList[]);

const cleanPercentage = (num: number, max: number) =>
  Math.max(0, Math.min(100, max ? Math.round((num / max) * 100) : 0));

function sortPrices(array: ItemDataWithHidden[]) {
  return array.sort(function (a, b) {
    const x = a.price.value;
    const y = b.price.value;

    const xIsNum = typeof x === 'number' && !isNaN(x);
    const yIsNum = typeof y === 'number' && !isNaN(y);

    if (xIsNum && yIsNum) {
      return x - y;
    }
    if (xIsNum && !yIsNum) {
      return -1;
    }
    if (!xIsNum && yIsNum) {
      return 1;
    }
    return 0;
  });
}

interface ItemDataWithHidden extends ItemData {
  isHidden: boolean;
}

type Props = {
  albums: {
    list: UserList;
    stamps: ItemDataWithHidden[];
  }[];
  messages: any;
  locale: string;
};

const StampCollector = (props: Props) => {
  const t = useTranslations();

  return (
    <>
      <Box
        position="absolute"
        h="650px"
        left="0"
        width="100%"
        bgGradient={`linear-gradient(to top,rgba(0,0,0,0) 0,rgba(66, 202, 255, 0.7) 70%)`}
        zIndex={-1}
      />
      <Center mt={8} flexFlow="column" gap={2} textAlign="center">
        <Image
          src={'https://images.neopets.com/shopkeepers/58.gif'}
          width={200}
          height={200}
          objectPosition={'top'}
          objectFit={'cover'}
          borderRadius={'md'}
          boxShadow={'md'}
          alt="post office man"
        />
        <Heading as="h1" size="lg">
          {t('StampCollector.stamp-collector')}
        </Heading>
        <Text maxW={'700px'} textAlign={'center'} fontSize={'sm'} sx={{ textWrap: 'pretty' }}>
          {t('StampCollector.description')}
        </Text>
        <Center mt={8} w="100%">
          <SimpleGrid columns={[1, null, 2, 3]} gap={2} w="100%">
            {props.albums.map((album, i) => (
              <AlbumCard key={i} list={album.list} stamps={album.stamps} />
            ))}
          </SimpleGrid>
        </Center>
        <FeedbackButton mt={5} />
      </Center>
    </>
  );
};

export default StampCollector;

type AlbumCardProps = {
  list: UserList;
  stamps: ItemDataWithHidden[];
};

const AlbumCard = (props: AlbumCardProps) => {
  const t = useTranslations();
  const format = useFormatter();
  const { list, stamps } = props;
  const released = stamps.length;
  const owned = stamps.filter((stamp) => stamp.isHidden === true);

  const NPPrice = useMemo(() => {
    if (!stamps) return 0;
    return stamps.reduce((sum, item) => {
      return sum + (item.price?.value ?? 0);
    }, 0);
  }, [stamps]);

  return (
    <GridItem bg="blackAlpha.400" p={3} borderRadius={'md'}>
      <Flex direction={'column'} gap={2} justify={'space-between'}>
        <Text as="div" textColor={'gray.300'} fontSize="lg" textAlign="left">
          {list.name.replace('Stamp Album -', '')}
        </Text>
        <Text as="div" textColor={'gray.300'} fontSize="sm" textAlign="left">
          {t('Lists.this-list-costs-aprox')}{' '}
          {!!NPPrice && (
            <>
              <b>{format.number(NPPrice)} NP</b>
              <Image
                as={NextImage}
                display="inline"
                verticalAlign="bottom"
                src={NPBag}
                width="24px"
                height="24px"
                alt="gift box icon"
                mt="-7px"
                ml="3px"
              />
            </>
          )}
        </Text>
        <Flex direction={'row'} gap={2} justify={'space-between'}>
          <Text as="span" textColor={'gray.300'} fontSize="sm">
            STATUS
          </Text>
          <Text as="span" textColor={'gray.300'} fontSize="sm">
            {released} / {ALBUM_MAX} released &middot; {cleanPercentage(released, ALBUM_MAX)}%
          </Text>
        </Flex>
        <Progress
          colorScheme="purple"
          size="lg"
          borderRadius={'md'}
          min={0}
          max={ALBUM_MAX}
          value={released}
        />
        <Flex direction={'row'} gap={2} justify={'space-between'}>
          <Text as="span" textColor={'gray.300'} fontSize="sm">
            COLLECTION
          </Text>
          <Text as="span" textColor={'gray.300'} fontSize="sm">
            {owned.length} / {released} collected &middot; {cleanPercentage(owned.length, released)}
            %
          </Text>
        </Flex>
        <Progress
          colorScheme="cyan"
          size="lg"
          borderRadius={'md'}
          min={0}
          max={ALBUM_MAX}
          value={owned.length}
        />
        {owned.length === released && (
          <Text as="span" textColor={'green.300'} fontSize="md">
            Collection up to date!
          </Text>
        )}
        {owned.length !== released && <NeededStampsList stamps={props.stamps} owned={owned} />}
      </Flex>
    </GridItem>
  );
};

type NeededStampsList = {
  stamps: ItemDataWithHidden[];
  owned: ItemDataWithHidden[];
};

const NeededStampsList = (props: NeededStampsList) => {
  const { stamps, owned } = props;

  const sorted = sortPrices(stamps);

  return (
    <Accordion allowToggle>
      <AccordionItem border={'none'}>
        <AccordionButton bg="blackAlpha.400" _hover={{ bg: 'whiteAlpha.100' }} borderRadius={'md'}>
          <Box as="span" flex="1" textAlign="left">
            Collectibles Needed ({stamps.length - owned.length})
          </Box>
          <AccordionIcon />
        </AccordionButton>

        <AccordionPanel pb={4}>
          <Flex wrap="wrap" gap={2} justifyContent={'center'}>
            {sorted.map((item, i) => !item.isHidden && <ItemCard item={item} key={i} small />)}
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const lists = await getUserLists('official', null, 100);
  const albums = [];
  const username = 'patt';

  const allCollectibles = lists.find(
    (list) => list.visibility !== 'public' && list.slug === 'all-collectibles'
  );

  if (allCollectibles) {
    const userLists = await getUserLists(username, null, 100);
    const match = userLists.find((list) => list.linkedListId === allCollectibles.internal_id);
    if (match) {
      const [preloadData] = await Promise.all([preloadListItems(match, true, 999)]);
      const preloadMap = new Map(preloadData.items.map((p) => [p.item_iid, p.isHidden]));
      for (const list of lists) {
        if (list.visibility === 'public') {
          const list_id = list.internal_id.toString();
          if (!list_id) return null;
          const listItems = await getListItems(list_id, 'official');
          if (listItems) {
            albums.push({
              list,
              stamps: listItems.map((item) => ({
                ...item,
                isHidden: preloadMap.get(item.internal_id) ?? false,
              })),
            });
          }
        }
      }
    }
  }

  context.res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=300');

  return {
    props: {
      albums: albums,
      messages: await loadTranslation(context.locale as string, 'tools/stamp-collector'),
      locale: context.locale,
    },
  };
}

StampCollector.getLayout = function getLayout(page: ReactElement, props: any) {
  const t = createTranslator({ messages: props.messages, locale: props.locale });

  return (
    <Layout
      SEO={{
        title: t('StampCollector.stamp-collector'),
        description: t('StampCollector.description'),
        themeColor: '#3697bf',
      }}
      mainColor="#3697bfc7"
    >
      {page}
    </Layout>
  );
};
